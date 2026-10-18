# Fluxo de Migração do Onboarding

## Fluxo Atual

O onboarding agora usa um assistente de várias etapas:

1. `Sessions`
   - Seleciona apenas o escopo de workspace para a migração de sessões.
   - Não inicia a importação.
2. `Agent Settings`
   - Seleciona apenas as categorias de provider / skill / plugin.
   - Não inicia a importação.
3. `Migration`
   - Executa o pipeline de importação unificado.
   - Exibe o progresso compartilhado durante a execução.
   - Reutiliza a mesma etapa para mostrar o resumo do resultado final após a migração terminar.

A ordem atual das etapas visíveis é:

1. `Sessions`
2. `Skills`
3. `MCP Servers`
4. `Commands`
5. `AGENTS.md`
6. `Migration`

## Origem do Scan de Sessões

- O scan de migração do onboarding / configurações do desktop lê o histórico nativo do Claude Code em `{HOME}/.claude/projects/**/*.jsonl` (também tenta `os.homedir()` e `ZCODE_DATA_BASE_DIR` como candidatos de HOME).
- Implementação: `packages/services/src/session/claude-native/claudeNativeSessionImportRepo.ts`, conectado via `IZCodeTaskService.scanImportableClaudeSessions`.
- As tarefas importadas são indexadas com `provider: "claude"` e `migrationSource: "claudeCode"`. Por padrão, as listas de tarefas do ZCode Agent filtram por `glm`, mas também incluem as linhas com `migration_source = claudeCode`, de modo que o histórico migrado aparece na barra lateral sem misturar linhas de índice do Claude antigas e não migradas.

## Importação de Sessões Claude → ZCode

Os `.jsonl` nativos do Claude Code e o snapshot do protocolo ZCode **não são o mesmo formato**, então a normalização acontece na camada de services durante a importação:

1. `claudeNativeSessionImportParser.ts` lê o jsonl, filtra sidechain / assistant sintético e agrega múltiplos trechos de assistant em um `ZCodePersistedMessage[]` no formato "um turno do usuário + um turno do assistant".
2. `session/create` dá suporte a `importedHistory`, e o serviço de importação cria uma sessão real do ZCode Protocol gravando as mensagens de histórico normalizadas no session store do zcode-cli. O `taskId` após a importação é o próprio `sessionId` real, portanto `sendPrompt`, `setModel` e `setMode` continuam atingindo o mesmo runtime.
3. `buildImportedClaudeTaskFile.ts` ainda gera um snapshot de backup da migração; antes da geração, os campos de runtime da origem são limpos por caminho de propriedade, filtrando por padrão `meta.mode`, `meta.model`, `meta.provider` e `messages[].model`, evitando que o modelo/modo/provider do Claude Code contamine a seleção de runtime do workspace atual do ZCode.
4. `persistImportedClaudeTask.ts` grava `~/.zcode/v2/sessions/{workspaceHash}/{taskId}.json` (backup de snapshot legado), sincroniza o índice de tarefas em sqlite e dispara `workspace_task_list_changed`. Os metadados de listagem do novo caminho de importação vêm da sessão real do ZCode, preservando `migrationSource: "claudeCode"`.
5. A cópia nativa do jsonl é replicada em `~/.zcode/v2/agent-config/claude/{workspaceHash}/projects/...`, para uso posterior na cadeia de continuação de conversa do Claude.

Ao abrir uma tarefa migrada, a restauração prioriza a sessão real do ZCode; o fallback para a restauração de histórico somente leitura a partir do **JSON de sessão legado** ocorre apenas quando os dados antigos não têm uma protocol session correspondente.

## Memória do Usuário Claude → AGENTS Padrão do ZCode

- A etapa `AGENTS.md` verifica o arquivo de memória do usuário do Claude em `{HOME}/.claude/CLAUDE.md`.
- Se o arquivo de origem existir, a etapa pode copiá-lo para `{HOME}/.zcode/AGENTS.md`.
- `~/.zcode/AGENTS.md` é o arquivo de instruções padrão de nível de usuário. O runtime o lê quando presente e o mescla antes do `AGENTS.md` do workspace resolvido a partir do diretório de trabalho atual até a raiz do projeto.
- Essa migração é explícita e selecionada pelo usuário no assistente. Não faz parte do seletor genérico de importação de skills / commands / MCP, porque ela sobrescreve intencionalmente um arquivo de instruções padrão conhecido, em vez de importar apenas os recursos ausentes.
- Antes de o assistente entrar na etapa final `Migration`, selecionar esta ação de cópia precisa abrir um diálogo de confirmação. A ação de cópia pode substituir um `{HOME}/.zcode/AGENTS.md` existente, portanto o diálogo deve dizer claramente que a configuração padrão de AGENTS será sobrescrita.
- A camada de serviço realiza a cópia no diretório home do usuário. `workspacePath` / `workspaceIdentity` são carregados apenas para logging / correlação de requisição e não devem ser usados como caminho de destino no sistema de arquivos.
- Caminhos de remoto e de controle remoto móvel não devem introduzir um runtime separado para esta ação de cópia. A ação permanece atrás da fronteira existente do serviço de settings-sync do processo host.

## Notas de Implementação

- `packages/ui/src/onboarding/OnboardingDialog.tsx`
  - Detém o estado do assistente e o fluxo unificado de execução.
- `packages/ui/src/onboarding/useOnboardingAgentsFileMigration.ts`
  - Carrega o status da migração da memória do usuário do Claude e executa a ação de cópia confirmada.
- `packages/ui/src/onboarding/OnboardingDialogParts.tsx`
  - Detém o chrome compartilhado do assistente, como sidebar, header e footer.
- `packages/ui/src/onboarding/OnboardingFlowParts.tsx`
  - Detém a renderização do conteúdo por etapa.
- `packages/services/src/settings-sync/settingsSyncService.ts`
  - Detém a operação de sistema de arquivos que copia `{HOME}/.claude/CLAUDE.md` para `{HOME}/.zcode/AGENTS.md`.
- `apps/zcode-cli/packages/adapters/src/context/index.ts`
  - Resolve `{HOME}/.zcode/AGENTS.md` e o `AGENTS.md` do workspace e, então, mescla os dois quando ambos existem.

## Regras de UX

- Etapas de seleção nunca disparam a importação imediatamente.
- A importação só começa ao entrar em `Migration`.
- A etapa `AGENTS.md` também é uma etapa de seleção. Ela não pode copiar arquivos até o usuário iniciar a migração e confirmar o diálogo de sobrescrita.
- A etapa `Migration` detém tanto o estado de execução quanto o estado de resultado concluído.
- A página de configurações pode reabrir o mesmo fluxo de onboarding a partir de `General`.
- A view de boas-vindas reutiliza o mesmo visual hero sensível ao tema da tela `Open Workspace` e acrescenta um texto leve sobre migração por cima, para que o lado direito ainda comunique propósito em vez de ser puramente decorativo.