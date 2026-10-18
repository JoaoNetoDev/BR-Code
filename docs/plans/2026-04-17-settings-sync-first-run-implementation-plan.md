# Sincronização de configurações no primeiro uso (importação de configurações) — Implementation Plan

> **Status: plano histórico, não implementado conforme este documento.** Os drafts de design de ACP/multi-Agent dos quais ele depende e o módulo
> `settings-sync` listado aqui foram descontinuados ou nunca foram criados; este documento mantém apenas o contexto das decisões e não pode servir como ponto de entrada da implementação atual.

Data de atualização: 2026-04-17

## Revisão antes da execução

O plano original se baseava em `docs/plans/2026-04-17-settings-sync-first-run-design.md`, removido depois; esse design só pode ser rastreado pelo histórico do Git.

Uma restrição de engenharia que precisa ser fixada cedo na implementação:

- Na importação de configurações de cada origem, fazer apenas o "mapeamento mínimo e seguro", sem buscar reproduzir um-para-um toda a semântica do sistema de origem no ZCode.

Motivo:

- Os layouts de origem das três categorias de configuração `providers / skills / plugins` são diferentes
- O repositório atual já possui, para cada uma, lógica de espelhamento, gravação em disco e gestão de estado de habilitação
- Se a funcionalidade de sincronização inventar ad hoc uma lógica de "cópia integral + interpretação de compatibilidade", o risco de manutenção posterior aumenta claramente

Por isso esta implementação adota uniformemente:

- O repo de origem负责 pela descoberta e leitura
- O service `settings-sync`负责 pela normalização e orquestração das tarefas
- A gravação no destino sempre reutiliza o service de negócio existente ou a capacidade do seu repo

## Estratégia de lotes

Pelas regras de `executing-plans`, por padrão executa-se primeiro as 3 primeiras tarefas e então para para reportar o resultado da verificação.

Batch 1: Task 1 ~ Task 3

Após concluir, reportar:

- O que foi implementado
- Resultado da verificação
- Riscos restantes

## Task 1: definir tipos shared e canal RPC

### Objetivo

Estabelecer uma face de protocolo shared independente para `settings-sync`, evitando que UI / services compartilhem estruturas internas diretamente.

### Arquivos modificados

- Modify: `packages/shared/src/channels.ts`
- Create: `packages/shared/src/settings-sync.ts`
- Modify: `packages/shared/src/index.ts`

### Passos de implementação

1. Adicionar `SettingsSync` em `ServiceChannels`
2. Criar `settings-sync.ts` definindo os tipos a seguir:
   - `SettingsSyncAgent`
   - `SettingsSyncCategory`
   - `SettingsSyncCategorySummary`
   - `SettingsSyncAgentSummary`
   - `SettingsSyncDiscoveryResult`
   - `SettingsSyncSelection`
   - `SettingsSyncProgressEvent`
   - `SettingsSyncImportResult`
   - `SettingsSyncFirstRunPromptState`
3. Manter o nome dos tipos neutro, sem embutir campos de estado de UI
4. Exportar esses tipos a partir de `packages/shared/src/index.ts`

### Verificação

- `pnpm typecheck --filter @zcode/shared`, ou o `pnpm typecheck` da raiz caso não seja suportado

## Task 2: estabelecer o esqueleto dos services e a cadeia de registro

### Objetivo

Conectar o serviço `settings-sync` à cadeia existente channel -> descriptor -> accessor -> proxy.

### Arquivos modificados

- Create: `packages/services/src/settings-sync/settingsSync.ts`
- Create: `packages/services/src/settings-sync/settingsSyncService.ts`
- Create: `packages/services/src/settings-sync/types.ts`
- Modify: `packages/services/src/accessor.ts`
- Modify: `packages/services/src/index.ts`
- Modify: `packages/services/src/node.ts`
- Modify: `packages/client/src/remoteServiceAccess.ts`

### Passos de implementação

1. Definir `ISettingsSyncService` e `createServiceDescriptor` em `settingsSync.ts`
2. Definir em `types.ts` os tipos auxiliares internos do serviço:
   - entrada de repo de origem
   - tarefa de importação
   - resultado da tarefa
3. Implementar primeiro o esqueleto mínimo em `settingsSyncService.ts`:
   - `detect()` retorna resultado vazio
   - `importSelected()` retorna estatísticas vazias
   - `getFirstRunPromptState()` e `markFirstRunPromptHandled()` passam direto para o settingService por enquanto
4. Completar registro e exportação em `accessor.ts`, `index.ts`, `node.ts` e `remoteServiceAccess.ts`

### Verificação

- `pnpm typecheck` da raiz

## Task 3: completar o estado de configuração do primeiro uso

### Objetivo

Dar ao "prompt do primeiro uso aparece apenas uma vez" um estado persistido explícito, sem acoplar ao resultado da importação.

### Arquivos modificados

- Modify: `packages/services/src/setting/setting.ts`
- Modify: `packages/services/src/setting/settingService.ts`

### Passos de implementação

1. Adicionar em `AppSettings`:
   - `settingsSyncFirstRunPromptHandled?: boolean`
2. Preservar a compatibilidade com as settings antigas no `settingService`
3. Oferecer ao `settingsSyncService` dois caminhos de chamada:
   - ler o prompt state
   - gravar o handled state
4. Comentar explicando:
   - isto é "o prompt já foi consumido", e não "a importação foi bem-sucedida"

### Verificação

- `pnpm typecheck` da raiz
- `pnpm lint` da raiz

## Task 4: implementar a capacidade de discovery dos repos de origem

### Objetivo

Descobrir separadamente as configurações de origem de Providers / Skills / Plugins de `Claude Code / Codex / OpenCode`.

### Arquivos modificados

- Create: `packages/services/src/settings-sync/repo/claudeSettingsSyncSourceRepo.ts`
- Create: `packages/services/src/settings-sync/repo/codexSettingsSyncSourceRepo.ts`
- Create: `packages/services/src/settings-sync/repo/opencodeSettingsSyncSourceRepo.ts`
- Create: `packages/services/src/settings-sync/repo/shared.ts`
- Modify: `packages/services/src/settings-sync/settingsSyncService.ts`

### Passos de implementação

1. Oferecer a cada repo de origem uma estrutura de retorno unificada:
   - se a origem foi descoberta
   - listas de itens descobertos por categoria
2. A descoberta de `skills` prioriza a reutilização das regras existentes de diretório de skills, sem reinventar caminhos
3. A descoberta de `plugins` prioriza a reutilização das regras existentes de native root / mirror root
4. A descoberta de `providers` faz a leitura mínima pelas entradas de workspace/user config já existentes da origem
5. Agregar no service o resumo `Agent -> Category`

### Verificação

- Novos testes unitários do service correspondente ou, no mínimo, um smoke test
- `pnpm typecheck` da raiz

## Task 5: implementar o modelo de tarefas de importação e os eventos de progresso

### Objetivo

Converter a escolha do usuário em uma fila de tarefas ordenadas e estável, emitindo eventos de progresso que possam alimentar a UI.

### Arquivos modificados

- Modify: `packages/services/src/settings-sync/types.ts`
- Modify: `packages/services/src/settings-sync/settingsSyncService.ts`

### Passos de implementação

1. Converter `selection` em uma lista de tarefas `agent/category`
2. Filtrar itens não marcados ou cujo discovered está vazio
3. Definir os estados de cada tarefa:
   - `pending`
   - `running`
   - `success`
   - `skipped`
   - `failed`
4. Emitir `onProgress` no início e no fim de cada tarefa
5. Consolidar `successCount / skippedCount / failedCount`

### Verificação

- Testes unitários validando a ordem das tarefas e as estatísticas consolidadas

## Task 6: implementar a importação de Providers

### Objetivo

Concluir a importação segura de `Providers` da origem para o ZCode, respeitando "pular se já existir".

### Arquivos modificados

- Modify: `packages/services/src/settings-sync/settingsSyncService.ts`
- Optional Modify: `packages/services/src/model-provider/*` apenas se for realmente necessário reutilizar algum helper

### Passos de implementação

1. Ler as entradas de provider da origem a partir do resultado do discovery
2. Fazer o 判断 de conflito com a lista atual de providers do ZCode
3. Chamar a capacidade existente de gravação de model provider apenas para os itens ausentes
4. Não gravar diretamente o arquivo de armazenamento de providers dentro do service de sincronização

### Verificação

- Testes unitários cobrindo "importar itens ausentes / pular itens já existentes"

## Task 7: implementar a importação de Skills e Plugins

### Objetivo

Concluir a importação das duas categorias `Skills` e `Plugins`, mantendo a consistência com o sistema existente de espelhamento/habilitação.

### Arquivos modificados

- Modify: `packages/services/src/settings-sync/settingsSyncService.ts`
- Optional Modify: helpers relacionados de `skillsService` / `plugins*Repo`, apenas se a reutilização for insuficiente

### Passos de implementação

1. `Skills`: com base nas regras existentes de diretório de origem, copiar/espelhar as skills ausentes para a posição gerenciada do ZCode
2. `Plugins`: fazer a importação mínima com base no espelhamento de plugin já existente ou nas informações de instalação via marketplace
3. Itens já existentes são uniformemente registrados como `skipped`
4. Itens com falha não bloqueiam as outras tarefas

### Verificação

- Testes unitários cobrindo sucesso/pulo/falha para skills e plugins

## Task 8: adicionar o hook de UI e a máquina de estados do diálogo de primeiro uso

### Objetivo

Estabelecer no lado da UI um fluxo independente de sincronização de configurações do primeiro uso, sem invadir a lógica existente da página de settings.

### Arquivos modificados

- Create: `packages/ui/src/hooks/useSettingsSync.ts`
- Create: `packages/ui/src/settings-sync/SettingsSyncFirstRunDialog.tsx`
- Create: `packages/ui/src/settings-sync/SettingsSyncDiscoveryStep.tsx`
- Create: `packages/ui/src/settings-sync/SettingsSyncSelectionStep.tsx`
- Create: `packages/ui/src/settings-sync/SettingsSyncImportingStep.tsx`
- Create: `packages/ui/src/settings-sync/SettingsSyncCompleteStep.tsx`

### Passos de implementação

1. O hook gerencia os quatro estados discovery / selection / importing / complete
2. Os componentes usam os design tokens e o sistema de botões existentes
3. A lista colapsável adota `Agent -> Category`
4. Só é permitida a importação quando pelo menos um item estiver selecionado

### Verificação

- Testes de componente cobrindo a troca de passos e a disponibilidade dos botões

## Task 9: integrar a lógica de disparo do primeiro uso no Root

### Objetivo

Exibir o assistente de importação uma única vez, apenas na primeira abertura real e quando houver itens importáveis.

### Arquivos modificados

- Modify: `packages/ui/src/Root.tsx`
- Optional Modify: `packages/ui/src/root/useRootPlatformEffects.ts`
- Optional Modify: pontos de entrada relacionados de inicialização do app-shell

### Passos de implementação

1. Depois que o root estiver estável, verificar:
   - se é o cenário de primeira abertura
   - se o prompt state já foi consumido
   - se `detect()` tem categorias importáveis
2. Montar o dialog quando as condições forem satisfeitas
3. Marcar handled de forma unificada quando o usuário clicar em "Não importar agora" ou após uma importação bem-sucedida
4. Adicionar um UI logger para facilitar o diagnóstico de problemas de sequenciamento no primeiro uso

### Verificação

- Verificação manual de que a primeira exibição ocorre, o pulo funciona e, após reiniciar, não exibe de novo

## Task 10: completar testes e verificação final

### Objetivo

Completar os testes unitários principais, os testes de componente e a verificação estática final.

### Arquivos modificados

- Create/Modify: os arquivos de teste correspondentes

### Passos de implementação

1. Cobrir detect, o consolidado da importação e o prompt state do primeiro uso
2. Cobrir o fluxo de quatro passos da UI e a lógica de desabilitação do botão principal
3. Executar:
   - `pnpm typecheck`
   - `pnpm lint`

## Escopo de execução do Batch 1

Nesta rodada executa-se primeiro:

- Task 1: definir tipos shared e canal RPC
- Task 2: estabelecer o esqueleto dos services e a cadeia de registro
- Task 3: completar o estado de configuração do primeiro uso

Depois disso, para e reporta, aguardando o feedback do próximo lote.