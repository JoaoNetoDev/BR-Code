# Plano de Implementação de Metadata do Catálogo de Model Providers

> Status (2026-07-15): implementado; este documento permanece como plano histórico de implementação. Os fatos atuais estão em
> `packages/shared/src/model-provider-types.ts`, `packages/services/src/model-provider/` e
> `packages/ui/src/settings/model-provider-section/`; as caixas de seleção abaixo não representam o progresso atual.

> **Para trabalhadores agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Implementar o design de metadata do catálogo de model providers descrito em `docs/superpowers/specs/2026-06-03-model-provider-catalog-metadata-design.md`.

**Arquitetura:** Adicionar primeiro os schemas compartilhados de catálogo/provider v2 e os helpers de migração, depois fazer o host service ler/gravar dados de provider v2, fontes de catálogo e ordem de exibição. A UI consome modelos de objeto e uma ordem de exibição independente, enquanto a projeção do registro do ZCode Agent permanece como o único caminho de metadata de runtime.

**Stack tecnológico:** TypeScript, Zod, Vitest, React, @dnd-kit, servidor dev desktop Electron.

---

### Tarefa 1: Schema Compartilhado e Projeção

**Arquivos:**
- Modificar: `packages/shared/src/model-provider-types.ts`
- Modificar: `packages/shared/src/zcode-protocol/index.ts`
- Teste: `packages/shared/test/zcodeProtocol.test.ts`

- [ ] **Passo 1: Escrever testes de schema e projeção que falham**

Adicionar testes para fazer o parse de um arquivo de catálogo `zcode.model-providers.v1`, fazer o parse de um arquivo de store de provider v2, migrar um array legado de providers "bare" para v2, e projetar context window, modalidade de imagem, max output tokens, model id consciente de kind e opções de reasoning do provider.

- [ ] **Passo 2: Executar os testes focados e verificar a falha**

Executar: `pnpm vitest run packages/shared/test/zcodeProtocol.test.ts`
Esperado: FAIL porque os schemas de catálogo/provider v2 e os novos helpers de projeção ainda não existem.

- [ ] **Passo 3: Implementar tipos, schemas, helpers de migração e projeção compartilhados**

Adicionar `ModelProviderKind`, `ModelProviderCatalogFile`, `ModelProviderModelConfig`, `ModelProviderStoreFile`, tipos de estado de ordem de exibição, funções auxiliares de modelo, migração legada, resolução de endpoint/kind, aplicação de patch de reasoning e `convertModelProviderConfigToZCodeProviderInput` consciente de v2.

- [ ] **Passo 4: Executar os testes focados e verificar a aprovação**

Executar: `pnpm vitest run packages/shared/test/zcodeProtocol.test.ts`
Esperado: PASS.

### Tarefa 2: Armazenamento do Service, Fontes de Catálogo e Ordem de Exibição

**Arquivos:**
- Modificar: `packages/services/src/model-provider/modelProvider.ts`
- Modificar: `packages/services/src/model-provider/modelProviderService.ts`
- Modificar: `packages/services/src/model-provider/modelProviderServiceStorage.ts`
- Criar: `packages/services/src/model-provider/modelProviderCatalogSources.ts`
- Teste: `packages/services/test/modelProviderService.test.ts`

- [ ] **Passo 1: Escrever testes de service que falham**

Adicionar testes para carregamento do catálogo local da China, conversão de models.dev para o modelo de catálogo unificado, backup/escrita de volta do arquivo legado de provider para v2, migração de API key/mapping/nomes de exibição/formato e salvamento da ordem de exibição sem disparar o evento de mudança do registro de providers.

- [ ] **Passo 2: Executar os testes focados e verificar a falha**

Executar: `pnpm vitest run packages/services/test/modelProviderService.test.ts`
Esperado: FAIL porque as APIs do service e a migração de armazenamento estão ausentes.

- [ ] **Passo 3: Implementar as APIs de armazenamento e de fontes**

Fazer `readProviders` aceitar arquivos de store v2 e arrays legados "bare", gravar arquivos de store v2, preservar um backup v1 na migração, expor `getCatalogProviders`, `getDisplayOrder` e `saveDisplayOrder`, e garantir que as escritas de ordem de exibição não invalidem os snapshots do registro de providers.

- [ ] **Passo 4: Executar os testes focados e verificar a aprovação**

Executar: `pnpm vitest run packages/services/test/modelProviderService.test.ts`
Esperado: PASS.

### Tarefa 3: Edição de Modelos na UI e Ordenação de Providers

**Arquivos:**
- Modificar: `packages/ui/src/lib/modelProviderOrdering.ts`
- Modificar: `packages/ui/src/hooks/useModelProviders.ts`
- Modificar: `packages/ui/src/settings/model-provider-section/AddProviderCard.tsx`
- Modificar: `packages/ui/src/settings/model-provider-section/InlineEditableProviderCard.tsx`
- Modificar: `packages/ui/src/settings/model-provider-section/ProviderCardSections.tsx`
- Modificar: `packages/ui/src/settings/model-provider-section/ProviderFormControls.tsx`
- Modificar: `packages/ui/src/settings/model-provider-section/Navigation.tsx`
- Modificar: `packages/ui/src/settings/model-provider-section/useModelProviderNavigation.ts`
- Modificar: `packages/ui/src/settings/ModelProviderSection.tsx`
- Modificar: `packages/ui/src/chat-input-toolbar/modelSelection.ts`
- Modificar: `packages/ui/src/ChatInputToolbar.tsx`
- Teste: `packages/ui/test/modelProviderCodingPlan.test.ts`
- Teste: `packages/ui/test/chatInputToolbarModelGroups.test.ts`

- [ ] **Passo 1: Escrever testes puros de UI que falham**

Adicionar testes para ordenação pela ordem de exibição, entrada de persistência da ordem de navegação em Settings, ordenação dos grupos de modelo do chat pela ordem de exibição, importação de catálogo gravando modelos de objeto e labels/kinds/modalidades de modelo de objeto usados por filtragem e exibição.

- [ ] **Passo 2: Executar os testes focados de UI e verificar a falha**

Executar: `pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts packages/ui/test/modelProviderCodingPlan.test.ts`
Esperado: FAIL porque a UI ainda usa listas de modelos em string e não existe ordem de exibição.

- [ ] **Passo 3: Implementar as mudanças de UI**

Adicionar estado de hook de ordem de exibição aos hooks de model provider, usar handles de ordenação do `@dnd-kit` nos itens de navegação de providers, salvar a ordem de forma otimista com log de rollback, migrar as rows de modelo para edição de metadata de objeto, adicionar seleção de fonte de catálogo e passar a ordem de exibição para o agrupamento de modelos do chat.

- [ ] **Passo 4: Executar os testes focados de UI e verificar a aprovação**

Executar: `pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts packages/ui/test/modelProviderCodingPlan.test.ts`
Esperado: PASS.

### Tarefa 4: Documentação e Verificação Obrigatória

**Arquivos:**
- Criar ou atualizar: `docs/model-provider-catalog-metadata.md`

- [ ] **Passo 1: Documentar o limite da implementação**

Registrar a fonte do catálogo local da China, o ponto futuro de migração para CDN, o comportamento de migração do store v2, o arquivo de ordem de exibição e o escopo da verificação manual no desktop.

- [ ] **Passo 2: Executar a verificação de código**

Executar:
- `pnpm vitest run packages/shared/test/zcodeProtocol.test.ts packages/services/test/modelProviderService.test.ts packages/ui/test/chatInputToolbarModelGroups.test.ts packages/ui/test/modelProviderCodingPlan.test.ts`
- `pnpm typecheck`
- `pnpm lint`

Esperado: todos os comandos saem com 0.

### Tarefa 5: Verificação Manual no Desktop

**Arquivos:**
- Apenas runtime; nenhuma edição de código-fonte, a não ser que bugs sejam encontrados.

- [ ] **Passo 1: Iniciar o app desktop**

Executar: `pnpm dev:desktop`.
Usar `computer-use` para interagir com a UI do desktop.

- [ ] **Passo 2: CRUD de providers na página de Settings**

Verificar:
- Importação de provider do catálogo da China.
- A importação de provider do models.dev continua funcionando.
- Criação/edição/exclusão de provider custom.
- Salvamento de nome do provider/API key/base URL/kind padrão.
- Salvamento de model id/nome de exibição/kinds/kind padrão/modalidades/context/output/toggles de nível de reasoning.
- A reordenação de providers por drag persiste após reiniciar.
- A ordem de exibição afeta a navegação de Settings e a ordem dos grupos de modelo do chat.

- [ ] **Passo 3: Verificação de runtime no chat**

Verificar:
- O seletor de modelo do chat lê a metadata mais recente do provider.
- Trocar provider/modelo atualiza a próxima mensagem enviada.
- Trocar o nível de thought/reasoning atualiza a próxima mensagem enviada.
- Os logs mostram que o provider selecionado, o modelo e as opções de reasoning/provider estão efetivos para cada mensagem enviada.

- [ ] **Passo 4: Iterar sobre as falhas**

Para qualquer falha, usar depuração sistemática: coletar logs/evidências de CDP, identificar a causa raiz, adicionar ou atualizar um teste de regressão automatizado quando prático, corrigir, reiniciar e repetir a verificação manual.

### Tarefa 6: Commit

**Arquivos:**
- Toda a implementação, testes, docs e arquivos de catálogo alterados.

- [ ] **Passo 1: Inspecionar diff e status**

Executar: `git status --short` e `git diff --stat`.

- [ ] **Passo 2: Commitar com Conventional Commit**

Executar: `git add ... && git commit -m "feat: add provider catalog metadata"`.
Esperado: o commit tem sucesso.