# Plano de implementação da convergência dos dois ramos de Memory

## 1. Objetivo atual e única autoridade

- Forma de requisição aplicável: Anthropic Messages + `mid-conversation-system-2026-04-07`
- Objeto de aceitação: corpo final da requisição ao provider

A ordem de autoridade do comportamento é fixa: Memory spec → fixture semântico → generator/adapter/E2E de produção. Capturas antigas, registros históricos de Phase e objetos Context intermediários não definem mais o comportamento atual; as evidências históricas de execução são preservadas pelo Git, e este arquivo não mantém um segundo contrato ativo.

Três pontos de comportamento compartilham a mesma chave de ramo de recuperação: Main pointer, filtro do índice AutoMem e inicialização do Selector.

| branch                  | Main pointer | `MEMORY.md` index | Selector | `relevant_memory` |
| ----------------------- | ------------ | ----------------- | -------- | ----------------- |
| `default-index`（当前） | 是           | 加载              | 不启动   | 不注入            |
| `semantic-recall`       | 否           | 不读取            | 启动     | tool batch 后注入 |

```text
PROJECT_MEMORY_SEMANTIC_RECALL_ENABLED = false
                       |
                       v
        resolveProjectMemoryRetrievalBranch()
                       |
          +------------+-------------+
          |                          |
   default-index              semantic-recall
   pointer + index            selector + recall
   no selector                no pointer/index
```

Extraction, handler do Dream, escritas em foreground, Custom Agent Memory, a chave geral nas Settings e as fronteiras Desktop/mobile/protocol não participam deste ramo de recuperação.

Fluxo fixo de cada Phase:

- [ ] Reler primeiro a spec e as implementações relacionadas.
- [ ] Adicionar primeiro um teste que falhe ou um fixture visível ao provider.
- [ ] Implementar apenas o comportamento congelado nesta Phase.
- [ ] Executar testes focados, typecheck/lint e uma auto-revisão de escopo.
- [ ] Atualizar o checklist e as evidências de verificação deste arquivo.
- [ ] Não fazer commit em nenhum momento.

## 2. Phase 0：convergência da spec e da autoridade de aceitação

- [x] Registrar na Memory spec a matriz de dois ramos e a chave de ramo compartilhada pelos três pontos.
- [x] Esclarecer que os dois conjuntos de comportamento visíveis ao provider são mutuamente exclusivos e que o ramo ativo atual é `default-index`.
- [x] Esclarecer que não serão adicionadas novas configurações, preferências de runtime, protocolo, variáveis de ambiente ou setters de teste.
- [x] Atualizar o catálogo MEM01/MEM07 e a matriz de cobertura; o WDIO cobre apenas o caminho ativo default atual.
- [x] Marcar os metadados dos fixtures como `default-index | semantic-recall | both`.
- [x] Nomear as duas versões semânticas do fixture do Main prompt como default e semantic.

## 3. Phase 1：autoridade única do branch e as três conexões

- [x] Substituir `semantic-recall.ts`, que só expressa a semântica de um lado, por `project-memory-retrieval-branch.ts`.
- [x] O `PROJECT_MEMORY_SEMANTIC_RECALL_ENABLED=false` bruto é definido apenas uma vez, nesse módulo.
- [x] Adicionar o `resolveProjectMemoryRetrievalBranch(boolean)` puro, mapeando para `default-index | semantic-recall`.
- [x] O restante do código de produção consome apenas o `ACTIVE_PROJECT_MEMORY_RETRIEVAL_BRANCH` derivado.
- [x] Main prompt: default tem pointer, semantic não tem pointer, o restante do texto é idêntico.
- [x] Main index: apenas default lê, projeta e faz seed do read-state; semantic pula antes de qualquer I/O de arquivo.
- [x] Ciclo de vida do recall: apenas semantic faz start/consume; default não varre, não envia requisições e não injeta.
- [x] compact/resume/context refresh mantêm a semântica existente de inicialização de sessão, sem novo estado de branch.

Critérios de saída: alterar o único booleano já alterna os três comportamentos de produção, e não existe caminho com pointer/index e Selector/Recall ativos simultaneamente.

## 4. Phase 2：fixtures de dois ramos, testes unitários e trajectory

- [x] Adicionar os fixtures exatos `main-memory-default-index.md` e `main-memory-semantic-recall.md`.
- [x] Manter `main-memory-index.md`, o request do selector e o fixture MCS de memória recuperada.
- [x] O resolver, orientado a tabela, cobre `false -> default-index` e `true -> semantic-recall`.
- [x] Os testes de Prompt cobrem os dois ramos literalmente e provam que só o trecho do pointer difere.
- [x] Os testes de Index provam que o ramo semantic não chama `readTextFile`, não projeta e não faz seed de read-state.
- [x] Os testes de Recall provam que start/consume no default é no-op; no semantic, `relevant_memory` é injetado uma única vez após um prefetch real do selector e um tool batch completo.
- [x] Os testes de provider-body congelam os dois corpos Main, o request do Selector e o MCS de Recall, e rejeitam combinações misturadas.
- [x] O provider scriptado do CLI headless reconhece os dois contratos de ramo; a build atual executa a trajectory default.
- [x] Não duplicar um segundo WDIO nem adicionar nova entrada de teste de produto.

## 5. Phase 3：validação de ponta a ponta e fechamento de escopo

- [x] Testes focados de retrieval/context/recall do Core.
- [x] Testes finais de wire de Memory/MCS do Adapter.
- [x] E2E de trajectory de Memory no CLI headless.
- [x] Contrato de fixture MEM08 e replay default real via WDIO no Electron.
- [x] `pnpm typecheck`, `pnpm lint`, `git diff --check`.
- [x] Auditoria com `rg` confirmando que o booleano bruto é definido apenas uma vez e que todos os chamadores consomem apenas o branch derivado.
- [x] Auditar diffs staged, unstaged e untracked, sem configuração, protocolo, UI, gatilho de Dream, retry, fallback, observer, repository ou tarefa persistente fora do plano.
- [x] Atualizar comandos de verificação, resultados e riscos residuais; manter as mudanças sem commit.

## 6. Não objetivos explícitos

Nesta rodada não modificamos:

- O ciclo de vida do `memoryEnabled` global do app, com escopo de sessão.
- `features.memory`, `memory.use`, root, permissões ou protocolo de arquivos.
- Snapshot/scheduler de Extraction, handler de Dream, Custom Agent Memory.
- Protocolos e UI de Desktop/mobile/relay.
- `/dream` ou qualquer entrada de gerenciamento de Memory.
- Ferramenta Read, scanner de secret/PII, observer de foreground.
- timeout, retry, fallback por palavra-chave, Repository, DB de jobs ou cursor persistente.
- Diferenças de system prompt dinâmico em outras formas de requisição.

## 7. Evidências de verificação desta rodada

- Core: 5 arquivos / 71 testes aprovados.
- Adapter: 2 arquivos / 7 testes aprovados.
- Headless `default-index`: 7 Main, 0 Selector, 5 Extraction, 2 Custom Agent; as asserções de exclusão mútua entre request e fixture de index passaram.
- Headless com troca temporária pontual para `semantic-recall`: 8 Main, 2 Selector, 5 Extraction, 2 Custom Agent, incluindo recall de fatos já existentes e recall de fatos de Extraction entre sessões; após a verificação, a constante foi restaurada para `false`.
- Electron WDIO: `conversation-session-memory.test.ts` com 1 teste aprovado, cobrindo o caminho ativo default atual, Extraction, Custom Agent e o gate de Settings desabilitado.
- `pnpm typecheck` em todo o repositório passou; `pnpm lint` em todo o repositório passou (0 erros, 52 warnings pré-existentes); `git diff --check` passou.
- A auditoria de escopo confirma que esta rodada não adicionou configuração, variável de ambiente, Settings, protocolo, UI, gatilho de Dream, retry, fallback, observer, Repository ou estado persistente; a constante atual permanece `false` e todas as mudanças seguem sem commit.