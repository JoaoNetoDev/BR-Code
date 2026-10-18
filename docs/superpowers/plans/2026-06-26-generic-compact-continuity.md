# Implementation Plan de Convergência do Compact Genérico Provider-Visible da ZCode

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not auto-commit, do not push, and leave all implementation changes unstaged for review.

**Goal:** Consolidar o conteúdo provider-visible do fluxo existente de compaction da ZCode (compact prompt, pós-processamento do summary, montagem do contexto pós-compact), aumentando a integridade da continuação da tarefa após o compact.

**Architecture:** Não criar branches específicos de modelo nem configurações específicas de modelo; atualizar diretamente o compact prompt existente, o pós-processamento do summary, a montagem de mensagens pós-compact, a preservação de recent-context, a restauração de read-state/file reminder e o cap de saída do compact summary. A implementação se limita à lógica/estratégia de compact congeladas neste plano, sem criar novas estratégias, abstrações ou chaves de configuração. A projeção de UI continua exibindo o compact como um único divider `context_compaction`, e a preservação de mensagens recentes no provider-visible não deve mudar a UI de chat.

**Tech Stack:** TypeScript, Vitest, `apps/zcode-cli/packages/core`, `@zcode/contracts`, testes de requisição provider-visible, stores existentes de compact/persistência de session.

## Global Constraints

- Não implementar capacidade de compaction do lado provider/server: pular `context_management`, `compact_20260112`, `compactionControl` do SDK, server compaction, cache edit/cache write/cache prefix sharing da API da Anthropic.
- Não superdimensionar, não improvisar: cada mudança de comportamento precisa apontar para a evidência de fixture/contrato provider-visible congelada neste plano; sem evidência suficiente, registrar o gap e parar na implementação mínima, sem adicionar estratégias fora do plano.
- Não adicionar fallback, heuristic, config switch, policy abstraction ou branch de modelo que «pareça mais estável», a menos que já seja lógica explícita e não pulada do caminho de compact deste plano.
- Preferir modificar os arquivos de compact existentes e os helpers existentes; só é permitido um desdobramento mínimo quando o estado necessário ao comportamento-alvo não couber claramente nas fronteiras existentes, e a tarefa deve registrar a justificativa e os pontos de chamada.
- Evitar patch sobre patch: se o mesmo ponto de código precisar de mais `if`/`else if`/`else` encadeados para chegar ao comportamento-alvo, primeiro consolidar esse ponto em um helper/fluxo de dados claro dentro das fronteiras existentes e só então aplicar o comportamento-alvo; o refactor serve apenas para reduzir a complexidade de branches e expressar a estratégia-alvo, sem migração de arquitetura por oportunidade.
- A requisição de compact summary precisa preservar a lista normal de ferramentas, para que o shape provider-visible fique consistente com um turno comum e reutilize ao máximo o cache do provider; a proibição de uso de ferramentas precisa ser implementada por negação de tool-call específica de compact, e não com `tools: []`.
- Não introduzir novos nomes de variável de ambiente ou de flag interna; se for preciso configurabilidade, reutilizar a config `compact` já existente na ZCode.
- Não criar arquivo de policy específico de modelo; todas as mudanças entram no caminho de compact genérico existente.
- Não mudar a semântica de exibição de compact na UI: a user message de summary continua sendo model-only e a UI continua renderizando apenas o divider.
- Não commitar nem fazer push automaticamente durante a implementação; ao final manter tudo unstaged, aguardando revisão humana.
- Antes de alterar a implementação, complementar os testes; após cada tarefa, rodar o Vitest correspondente e, no final, `pnpm typecheck` e `pnpm lint`.

---

## Explicit Skip List

- Compact no lado Server/API: `compact_20260112`, `context_management` e `compaction_delta` da API da Anthropic são registrados apenas como itens excluídos.
- Cache edit/cache write/cache sharing: não se faz comportamento de cache além do request cache-control; mas manter o shape normal de tools na requisição de compact é um requisito provider-visible do escopo deste plano e não uma capacidade de cache edit/server.
- Hooks externos de compact: não implementar a capacidade externa de hooks `PreCompact`/`PostCompact`; manter apenas os eventos/logs que a ZCode já possui.
- Texto de REPL VM: a ZCode não tem estado de REPL VM e não ganha prompt falso; apenas reservar um parâmetro opcional.
- Texto de recuperação de transcript: a ZCode hoje não tem capacidade de full transcript path, e a mensagem de summary pós-compact não injeta `read the full transcript at: ...`.
- `context_hint`/microcompact assistido por server: a ZCode hoje não tem a interface correspondente; o local microcompact não é o alvo padrão da convergência provider-visible desta rodada.

## File Map

- Modify: `apps/zcode-cli/packages/core/src/compact/prompt.ts`  
  Responsável pelo compact prompt full/recent, pela formatação do texto do summary e pela mensagem de continuação pós-compact.
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact.ts`  
  Responsável pela seleção de entradas do compact, pela preservação de grupos recentes, pelas entradas pós-compact, pelo posicionamento de todo/reminder e pelo reaproveitamento do tratamento existente de prompt-too-long.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`  
  Responsável pela integração do fluxo principal do compact active com a seleção de recentes, a restauração do read-state, o cap de saída do summary, o gate de evidência de tratamento de mídia e a exposição de ferramentas na requisição de compact.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active-helpers.ts`  
  Responsável pela montagem da requisição de compact, pela validação do summary e pela rejeição de tool-call.
- Modify: `apps/zcode-cli/packages/core/src/compact/policy.ts`  
  Responsável por preservar os valores padrão já validados da ZCode para auto threshold/output reserve, ajustando apenas o cap de saída da requisição de compact summary.
- Modify only if needed: `apps/zcode-cli/packages/core/src/runtime/methods/microcompact.ts` e `apps/zcode-cli/packages/core/src/compact/microcompact.ts`  
  As mudanças em local microcompact são explicitamente puladas; só é permitido manter o opt-in existente e as correções de segurança, sem ampliar isso para o alvo de convergência provider-visible de compact desta rodada.
- Modify: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`  
  Cobre a requisição de compact provider-visible, a requisição pós-compact, a preservação de recentes, a restauração de read-state e os invariantes de UI model-only.
- Modify: `apps/zcode-cli/packages/core/tests/compact-policy.test.ts` e `apps/zcode-cli/packages/core/tests/microcompact.test.ts`  
  Cobrem mudanças de threshold e de estratégia do microcompact.
- Modify: `apps/zcode-cli/tools/prompt-trajectory/tests/derive.test.ts`  
  Atualiza a expectativa de trajectory do shape da mensagem de compact summary.

## Task 1: consolidar o Compact Prompt e o Shape da Summary Message

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/compact/prompt.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
- Test: `apps/zcode-cli/tools/prompt-trajectory/tests/derive.test.ts`

**Interfaces:**
- Produce: `buildCompactPrompt(customInstructions, { mode?: "full" | "recent" | "up_to" })`
- Produce: `formatCompactSummary(text)` returns text shaped as `Summary:\n...` when `<summary>` exists.
- Produce: `buildCompactSummaryMessage(summary, options)` accepts `{ suppressFollowup?: boolean; transcriptPath?: string; recentMessagesPreserved?: boolean; replStateCleared?: boolean }`.

- [ ] Adicionar testes asseverando que o prompt full contém estas âncoras semânticas exatas:
  - `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.`
  - `Tool calls will be REJECTED and will waste your only turn`
  - `Preserve any security-relevant instructions or constraints verbatim`
  - `Current Work`
  - `Optional Next Step`
- [ ] Adicionar testes asseverando que o prompt recent contém:
  - `RECENT portion of the conversation`
  - `The earlier messages are being kept intact and do NOT need to be summarized`
  - `All user messages from the recent portion`
- [ ] Adicionar testes asseverando `formatCompactSummary("<analysis>x</analysis><summary>abc</summary>") === "Summary:\nabc"`.
- [ ] Adicionar testes asseverando que `buildCompactSummaryMessage("Summary:\nabc", { suppressFollowup: true })` inclui:
  - `ran out of context`
  - `covers the earlier portion`
  - `Resume directly`
  - e não inclui o texto de recuperação de transcript, a menos que uma futura capacidade de transcript path da ZCode seja explicitamente adicionada.
- [ ] Implementar o texto do prompt em `prompt.ts` usando o arquivo existente, e não um novo módulo de policy específico de modelo.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts apps/zcode-cli/tools/prompt-trajectory/tests/derive.test.ts`

## Task 2: alinhar a exposição de ferramentas da requisição de compact e a negação de tool call

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active-helpers.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Produce: `buildCompactSummaryRequestOptions(...)` ou helper equivalente que retorna os `tools: this.getTools()` normais e os metadados de compact.
- Produce: caminho de negação de tool-call específico de compact: qualquer tool call do modelo durante o compact é rejeitada antes da execução da ferramenta e aparece como `CoreErrorType.ModelError` com a mensagem `Compact summary model attempted to call tools`.
- Consume: `formatCompactSummaryOrThrow(runtime, result)` já existente para a validação final.

- [ ] Adicionar teste falhando: a requisição de compact summary inclui os mesmos contratos de ferramenta visíveis de um turno normal quando há ferramentas registradas.
- [ ] Adicionar teste falhando: a requisição de compact summary não executa ferramenta se o modelo retornar uma tool call; o runtime registra falha de compact e nenhuma parte de resultado de ferramenta é persistida.
- [ ] Adicionar teste falhando: o compact prompt provider-visible ainda contém o aviso de não usar ferramentas, mesmo com ferramentas presentes na requisição.
- [ ] Substituir `tools: []` em `compact-active.ts` pela lista normal de ferramentas visíveis no compact, normalmente `this.getTools()`.
- [ ] Manter a execução de compact como summary-only de turno único: se `runtime.extractToolCallsFromResult(result)` retornar qualquer tool call, falhar/tentar de novo pelo caminho de erro de compact existente; não agendar `ToolExecutor`.
- [ ] Garantir que o campo `toolCount` do evento `ModelRequest` reflita as ferramentas de compact realmente expostas, e não zero.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts -t "compact"`

## Task 3: implementar a preservação de grupos recentes para compact Auto/Reactive

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Produce: `selectCompactEntries(input)` retornando:
  - `entriesForSummary: RuntimeMessageEntry[]`
  - `preservedEntries: RuntimeMessageEntry[]`
  - `groupsPreserved: number`
  - `totalGroups: number`
- Consume: `buildPostCompactRuntimeEntries(activeEntries, summaryEntry, { preservedEntries, postCompactReminderEntries })`.

- [ ] Adicionar teste falhando: o compact reativo após overflow de contexto resume turnos antigos, mas preserva literalmente o grupo mais recente de assistant/tool/user na requisição de retry.
- [ ] Adicionar teste falhando: o compact automático antes de uma requisição do usuário ainda exclui a requisição pendente do usuário da requisição de summary e a inclui na requisição pós-compact.
- [ ] Atualizar o helper de agrupamento para dividir turnos da conversa pela fronteira de assistant turn quando disponível; se as entradas do runtime não tiverem IDs de assistant, usar agrupamento estável por ordem de papéis que mantenha as tool calls do assistant junto de seus resultados.
- [ ] Para `CompactTrigger.Auto` e `CompactTrigger.Reactive`, preservar ao menos o grupo completo mais recente, além de quaisquer entradas de usuário pendentes no final.
- [ ] Manter as requisições de compact summary active/reactive no compact prompt full mesmo quando há grupos recentes preservados; as mensagens recentes são preservadas no contexto pós-compact, e não trocando o summary prompt por um prompt só de recentes.
- [ ] Persistir `keptMessageCount`, `groupsPreserved` e `totalGroups` nos metadados de fronteira do compact quando disponível.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts -t "compact"`

## Task 4: restaurar o contexto recente de arquivos após o compact

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/read-file-state-hydrator.test.ts`

**Interfaces:**
- Produce: `buildPostCompactReadStateReminderEntries(input)` retornando `RuntimeMessageEntry[]` model-only.
- Input inclui `readFileState`, `workspaceRoot`, `workingDirectory`, `maxFiles = 5`, `maxTotalApproxTokens = 50_000`, `maxFileApproxTokens = 5_000`.

- [ ] Adicionar teste falhando: após ler um arquivo pequeno e fazer compact, a próxima requisição ao provider contém um reminder model-only com o caminho do arquivo e o conteúdo atual, depois da mensagem de summary.
- [ ] Adicionar teste falhando: após ler um arquivo grande demais e fazer compact, a próxima requisição ao provider contém `Note: <path> was read before the last conversation was summarized, but the contents are too large to include. Use Read tool if you need to access it.`
- [ ] Adicionar teste falhando: o compact não expõe o plan file, o memory file nem caminhos negados pelos reminders de arquivos recentes.
- [ ] Implementar a seleção a partir do `readFileState` atual do runtime antes de ele ser limpo/substituído.
- [ ] Ordenar pelo tempo de leitura mais recente, limitar a 5 arquivos e impor os orçamentos de token total e por arquivo.
- [ ] Manter intacta a semântica da proteção contra read-state obsoleto; esta tarefa apenas acrescenta reminders de continuidade visíveis pelo modelo.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts apps/zcode-cli/packages/core/tests/read-file-state-hydrator.test.ts`

## Task 5: remover o estado de Todo da ZCode do contexto pós-compact

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Não anexar estado de todo específico de compact após o compact. A cadência genérica do reminder de todo continua valendo, mas a conclusão do compact não restaura imediatamente a lista de todo atual no contexto provider-visible.

- [ ] Atualizar o teste de todo do compact existente para esperar que o corpo do summary não contenha `Current session todo state (authoritative):`.
- [ ] Adicionar a asserção de que a requisição pós-compact ao provider não contém o reminder de estado de todo restaurado.
- [ ] Remover o uso de `appendTodoStateToCompactSummary` de `compact-active.ts`.
- [ ] Remover a fiação de `buildPostCompactTodoReminderEntries` exclusiva de compact.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts -t "todo"`

## Task 6: investigar o drift atual de orçamento do Auto Compact e então manter os thresholds padrão da ZCode e alinhar o cap de saída do summary

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/compact/policy.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact.ts`
- Modify if needed: `apps/zcode-cli/packages/core/src/runtime/methods/context-usage.ts`
- Test: `apps/zcode-cli/packages/core/tests/compact-policy.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Produce: os diagnostics de `AutoCompactDecision` precisam expor fatos de orçamento suficientes para depurar falhas:
  - `contextWindow`
  - `effectiveContextWindow`
  - `threshold`
  - `tokenCount`
  - `tokenSource`
  - `providerContextUsageTokenCount`
  - `providerInputTokens`
  - `incrementalTokenCount`
  - `outputReserveTokens`
  - `summaryMaxOutputTokens`
- Padrões atuais aceitos após investigação/decisão do usuário: manter `DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 64_000` e `DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = 0.9`.
- Saída máxima da requisição de summary após investigação: `Math.min(20_000, capModelRequestMaxOutputTokens(config.maxOutputTokens))`.

- [ ] Adicionar um teste de regressão que reproduza o formato da falha relatada: o compact automático decide compactar e então a requisição de compact summary falha com overflow de contexto porque `requestInputTokens + maxOutputTokens > contextWindow`.
- [ ] Nesse teste, modelar o contorno observado pelo usuário: depois de descartar/rewindar várias mensagens antigas, o compact summary tem sucesso. Isso prova que a falha é de cálculo de orçamento, e não de semântica do summary prompt.
- [ ] Adicionar asserções de que os diagnostics de log/decisão identificam os termos ruins do orçamento: contagem de tokens ativa do provider, estimativa incremental local, saída máxima do summary, output reserve, threshold e context window.
- [ ] Verificar se `buildProviderUsageTokenOverride` deve preferir `contextUsageTokenCount` sobre `inputTokens`, ou usar `Math.max(inputTokens, contextUsageTokenCount)` quando o provider reporta ambos. Adicionar um teste falhando para a regra de fonte da verdade escolhida antes de alterar o código.
- [ ] Verificar se a estimativa incremental local de tokens após o último snapshot de uso do provider pode subcontar tool results grandes ou tokenização não-Anthropic. Adicionar um teste falhando em que o uso do provider é antigo, o contexto incremental é grande e a estimativa local atual deixa o compact automático começar tarde demais.
- [ ] Verificar se o orçamento da requisição de compact summary precisa reservar o texto do compact prompt e as ferramentas normais expostas, agora que a Task 2 mantém deliberadamente ferramentas nas requisições de compact. Adicionar um teste falhando em que os schemas das ferramentas expostas empurram a requisição de compact para além do contexto, a menos que o threshold deixe buffer suficiente.
- [ ] Verificar se `providerPostCompactTokenCount = getUsageTotalTokens(result.usage)` está sendo interpretado como o tamanho do contexto pós-compact, apesar de ser o uso da requisição de summary. Se for o caso, adicionar um teste de que `truePostCompactTokenCount` é a única proteção contra novo disparo até existir uma contagem real do provider para a próxima requisição.
- [ ] Manter os testes de policy padrão nos padrões da ZCode restaurados: output reserve de 64k e threshold de 90 por cento.
- [ ] Não mudar o output reserve desconhecido para 20k; apenas a saída máxima da requisição de compact summary é limitada a 20k.
- [ ] Manter a compatibilidade de config explícita onde `bufferTokens`, `summaryReserveTokens` ou overrides de threshold são fornecidos.
- [ ] Atualizar o teste de compact do runtime para asseverar que a requisição de geração de summary usa saída máxima limitada a 20k.
- [ ] Implementar as mudanças de summary-cap no runtime sem adicionar novas variáveis de ambiente.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/compact-policy.test.ts apps/zcode-cli/packages/core/tests/runtime-compact.test.ts -t "auto compact"`

## Task 7: pular explicitamente as mudanças de Local Microcompact

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/microcompact.ts`
- Modify: `apps/zcode-cli/packages/core/src/compact/microcompact.ts`
- Test: `apps/zcode-cli/packages/core/tests/microcompact.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- O keep-recent/substituição local depende da capacidade `context_hint`/fallback de server, e a ZCode hoje não tem a interface correspondente; esta rodada não muda o comportamento provider-visible do local microcompact.
- O caminho de convergência de compact do runtime não depende por padrão do microcompact; o local microcompact mantém apenas o opt-in explícito existente e as correções de segurança, evitando quebrar o cache hit ou poluir o contexto provider-visible na ausência de `context_hint`.

- [ ] Manter isto como um skip explícito nas notas de revisão; não adicionar novos requisitos de microcompact aqui até a ZCode ter capacidade de `context_hint`/compact de server.
- [ ] Garantir que o comportamento de compact full não dependa do microcompact estar habilitado.

## Task 8: o tratamento de mídia deve degradar em caso de falha, e não remover sempre

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Primeiro congelar o tratamento de mídia pretendido no compact com um fixture provider-visible. Só implementar retry/degradação se o comportamento congelado mantiver mídia suportada pelo provider na primeira tentativa de compact e remover/tentar de novo após uma falha de mídia/contexto.
- Se o comportamento congelado remover a mídia antes das requisições de compact summary, manter a direção de remoção existente e apenas ajustar o shape provider-visible de acordo.

- [ ] Adicionar uma nota de evidência nesta tarefa antes da implementação: o fixture/teste de contrato que prova se a mídia é preservada primeiro ou removida antes do compact.
- [ ] Se a mídia for preservada primeiro, adicionar teste falhando: a requisição de compact summary preserva o conteúdo mais recente de imagem/mídia na primeira tentativa quando o provider suporta mídia.
- [ ] Se a mídia for preservada primeiro, adicionar teste falhando: no erro de mídia grande demais, o compact tenta uma vez de novo com a mídia removida e tem sucesso.
- [ ] Se a mídia for removida antes do compact, adicionar teste falhando para essa projeção provider-visible exata e não adicionar caminho de retry.
- [ ] Implementar apenas o branch confirmado pela evidência.
- [ ] Preservar o comportamento atual de retry de prompt-too-long somente se ele já existir no fluxo de compact; não adicionar um novo nível de retry.
- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts -t "media"`

## Task 9: preservar o invariante do divider da UI

**Files:**
- Modify only if tests expose breakage: `packages/shared/src/zcode-session-visible-content.ts`
- Modify only if tests expose breakage: `packages/ui/src/lib/zcodeSessionProjection.ts`
- Modify only if tests expose breakage: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Test: existing UI/projection tests or add focused unit coverage near projection tests.

**Interfaces:**
- `isZCodeCompactSummaryMessage` deve continuar filtrando as mensagens de compact summary model-only.
- `synthesizeCompactionTimeline` deve continuar renderizando apenas as parts de compaction de ciclo de vida como o divider `context_compaction`.

- [ ] Adicionar teste de regressão com mensagem de summary + mensagens recentes preservadas + part de ciclo de vida do compact.
- [ ] Asseverar que o chat visível contém exatamente um divider `context_compaction`.
- [ ] Asseverar que a mensagem de compact summary model-only não é renderizada como balão de usuário.
- [ ] Não esconder mensagens de usuário realmente preservadas, a menos que o produto queira explicitamente que a UI as recolha; o comportamento desejado hoje é o divider substituindo o conteúdo histórico compactado.
- [ ] Run targeted UI/projection tests available in repo.

## Task 10: verificação Golden/Trajectory Provider-Visible

**Files:**
- Modify: `apps/zcode-cli/tools/prompt-trajectory/tests/derive.test.ts`
- Optional generated artifact review only: `apps/zcode-cli/tools/prompt-trajectory/out/...`

**Scenarios:**
- Compact manual completo.
- Compact automático com cauda de usuário pendente.
- Compact reativo após overflow de contexto do provider.
- Compact após ler um arquivo pequeno.
- Compact após ler um arquivo grande demais.

- [ ] Gerar ou atualizar fixtures de teste determinísticas, em vez de depender de artefatos `out/compact-*` desatualizados.
- [ ] Asseverar que a requisição de compact expõe os contratos de ferramentas normais para shape provider-visible/cache, enquanto as tool calls de compact são negadas antes da execução.
- [ ] Asseverar que a última user message da requisição de compact é o compact prompt congelado.
- [ ] Asseverar que a ordem da requisição pós-compact é: prefixo de contexto, mensagem de compact summary, entradas recentes preservadas, reminders pós-compact, input de usuário pendente.
- [ ] Asseverar que a projeção visível de UI/session ainda oculta o corpo do compact summary.

## Final Verification

- [ ] Run: `pnpm vitest run apps/zcode-cli/packages/core/tests/runtime-compact.test.ts apps/zcode-cli/packages/core/tests/compact-policy.test.ts apps/zcode-cli/packages/core/tests/microcompact.test.ts apps/zcode-cli/packages/core/tests/read-file-state-hydrator.test.ts apps/zcode-cli/tools/prompt-trajectory/tests/derive.test.ts`
- [ ] Run: `pnpm typecheck`
- [ ] Run: `pnpm lint`
- [ ] Run: `git status --short` and confirm changes are unstaged.
- [ ] Inspecionar manualmente um corpo de requisição provider-visible capturado para cada cenário principal antes de repassar.

## Acceptance Criteria

- O compact summary prompt e a mensagem de continuação correspondem à semântica local de compact congelada neste plano, excluindo a lista explícita de skips.
- Toda mudança de comportamento que não seja skip tem um ponteiro direto de evidência (fixture ou teste de contrato) em nomes de teste, comentários de teste ou notas do plano; nenhum fallback/heuristic/config/abstraction exclusivo da ZCode é introduzido como «um plus».
- O código de compact tocado não acumula cadeias de branches patch-on-patch; qualquer refatoração necessária é mínima, local às fronteiras de compact existentes e reduz o branching preservando o comportamento-alvo.
- A requisição de compact não usa mais `tools: []`; ela expõe as ferramentas normais, mas rejeita qualquer tool call de compact antes da execução.
- O compact Auto/Reactive não preserva mais apenas as entradas de usuário do final; os grupos recentes de assistant/tool/user necessários à continuidade sobrevivem literalmente.
- O conteúdo provider-visible pós-compact inclui reminders de continuidade de arquivos recentes vindos do read state.
- O estado de todo, se presente, é um reminder model-only separado e não é anexado ao texto do summary.
- Os diagnostics de orçamento do compact automático são cobertos, enquanto o threshold padrão aceito mantém output reserve de 64k e threshold de 90 por cento; a saída da requisição de compact summary é limitada a 20k.
- As requisições de compact summary reservam orçamento suficiente para o texto do compact prompt, as ferramentas normais expostas e a saída máxima do summary, de modo que o compact automático não dispare para uma falha previsível de overflow de contexto.
- As mudanças em local microcompact são explicitamente puladas até a ZCode ter capacidade de `context_hint`/compact de server; o comportamento provider-visible do compact full não pode depender do microcompact.
- A UI continua mostrando o compact como um único divider e não expõe o compact summary como balão de chat.