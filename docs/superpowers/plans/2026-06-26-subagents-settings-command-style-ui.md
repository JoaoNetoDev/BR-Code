# Subagents Settings Command Style UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar a UI de gerenciamento de subagents no painel de Settings para ter o mesmo layout, densidade e estilo de interação da página de configurações de commands.

**Architecture:** Ajusta apenas a camada de apresentação das subagents settings em `packages/ui`, sem alterar runtime, service schema ou a semântica de carregamento de subagents. A página de lista reaproveita a estrutura section/header/search/grouped-list de commands; a página de formulário reaproveita a estrutura back-to-list/form-card de commands, mantendo os campos específicos de subagent: model, color, tools checkbox e system prompt.

**Tech Stack:** React, TypeScript, Tailwind semantic tokens, primitives existentes de Button/Input/Select/Switch/Textarea, Vitest SSR UI tests.

## Global Constraints

- Seguir o `DESIGN.md` da raiz, usando semantic tokens e os UI primitives existentes.
- Alinhar apenas a UI de subagents settings; não alterar o CLI runtime, a resolução de profile, o mention provider ou o momento de vigência da session.
- O P0 ainda suporta apenas criação/edição de subagent user/global; built-in agent é exibido em modo somente leitura.
- Manter os checkboxes de múltipla seleção de ferramentas, sem regredir para um textarea free-form.
- Manter os textos de i18n sincronizados, sem hardcode de strings visíveis ao usuário.
- Não commitar automaticamente; só fazer commit após permissão explícita do usuário.

---

### Task 1: Alinhar a página de lista de Subagents ao estilo de section de Commands

**Files:**

- Modify: `packages/ui/src/settings/SubagentsSection.tsx`
- Modify: `packages/ui/test/subagentsSection.test.ts`

**Interfaces:**

- Consumes: `AgentSummary`、`AgentsCapability`、`ISubagentsService`
- Produces: commands-style subagent settings section with grouped dense list rows

- [x] Trocar o contêiner externo da página de lista, que era um grande container de página inteira com `bg-card`, por uma section `space-y-4`.
- [x] Trocar o topo por descrição à esquerda e icon ghost actions à direita: adicionar, abrir o diretório do usuário e atualizar.
- [x] Usar na caixa de busca o mesmo `Input size="lg" h-9 rounded-xl` de commands; manter o select de filtro por status.
- [x] Dividir em dois grupos por origem, user e built-in, usando `SettingsResourceGroupHeader` e `rounded-xl border bg-card + divide-y`.
- [x] Transformar o `AgentListRow` em uma dense row: identidade/descrição/caminho à esquerda, badges com scope/model/tools no meio e switch/edit/delete actions à direita.
- [x] Built-in/readonly agent não exibe editar nem excluir; user agent mantém switch, edição e exclusão.
- [x] Atualizar as asserções de teste: adicionar/abrir diretório ficam ocultos quando não há escrita, a lista é exibida agrupada e os checkboxes de ferramentas continuam existentes.

### Task 2: Alinhar a página de formulário de Subagent ao estilo de CommandForm

**Files:**

- Modify: `packages/ui/src/settings/SubagentsSection.tsx`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/test/subagentsSection.test.ts`

**Interfaces:**

- Consumes: `SubAgentConfig`
- Produces: command-style subagent create/edit form

- [x] A página de formulário usa o mesmo link button `Back to list` de commands, com título e descrição.
- [x] O corpo do formulário passa a ser um compact form card `rounded-xl border bg-card p-4`.
- [x] Manter os campos name, description, model, color, tools checkbox e system prompt.
- [x] Colocar a ação de exclusão à esquerda no form footer; os botões salvar/cancelar à direita, preservando a hierarquia de ações.
- [x] Completar o i18n de `settings.subagents.addDescription` e `settings.subagents.editDescription`.

### Task 3: Verificação

**Files:**

- Test: `packages/ui/test/subagentsSection.test.ts`

- [x] Executar `pnpm vitest run packages/ui/test/subagentsSection.test.ts`.
- [x] Se houver risco de tipo ou de lint, executar as validações do package relacionado.