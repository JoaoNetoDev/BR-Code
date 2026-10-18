# Ciclo de Vida do Catálogo de Skills do Composer

> Status: implementado em 2026-08-20 e aprovado na regressão de unidade/protocolo.
> Capacidades relacionadas: `capability.session-skill-catalog`、`surface.composer-slash-capability-picker`。
> Documentos relacionados: [mention-panel-layout.md](./mention-panel-layout.md)、
> [conversation-session-case-catalog.md](../conversation-session-case-catalog.md) S08。

## Resumo da Feature

| Campo | Valor |
| --- | --- |
| Mudança | Os candidatos de Skill do Composer passam de um snapshot de longa duração em nível de workspace para um catálogo com dupla authority, de workspace/session |
| Superfícies visíveis ao usuário | Grupo Skills do `/`; pontos de entrada compatíveis `$`、`¥`、`￥` |
| Camada da mudança | option-source / persistence / recovery |
| Donos de código existentes | `useSkills`、`SlashCommandPlugin`、`skillsMentionProvider`、CLI `AgentRuntime` |
| Fora de escopo | Catálogo de gestão de Skills nas Settings; armazenamento de instalação/remoção/ativação de Skill; catálogo de Subagent/command; formato canônico de menção |

## Semântica de produto

A superfície de gestão de Skills e a superfície de candidatos na conversa são duas authorities diferentes:

```text
Settings / instalação / remoção / ativação
  `-> catálogo gerenciado do workspace (reescaneia o disco a cada refresh explícito)

Rascunho novo no Composer
  |-> prewarm ainda não pronto: skills/referenceCatalog(sessionId ausente)
  |    `-> catálogo atual do workspace
  `-> prewarm P1 pronto: skills/referenceCatalog(sessionId=P1)
       `-> catálogo congelado na inicialização do AgentRuntime de P1
            `-> primeiro uso promovido a Session S1 oficial (mesmo runtime)

Session S1 quente já existente no Composer
  `-> skills/referenceCatalog(sessionId=S1)
       `-> catálogo congelado do runtime de S1 (sem hot load de Skill nova)

S1 sofre cold resume / restart do Agent runtime
  `-> novo runtime reescaneia o disco
       `-> nova requisição do catálogo de S1 após mudança de revision do runtime na UI
```

Portanto, "conversas existentes não atualizam" se limita ao mesmo ciclo de vida de runtime resident. O cold resume do CLI recria o runtime e reexecuta a descoberta de context/Skill, então a UI precisa consultar de novo conforme a authority do novo runtime, sem reutilizar permanentemente a Promise antiga nem o cache do renderer.

Informar explicitamente o nome de uma Skill que não está no catálogo congelado ser carregado dinamicamente pelo Agent continua seguindo as regras existentes da tool `Skill` do CLI; o Picker só exibe os candidatos declarados pela authority atual, sem usar isso para ampliar ou restringir as permissões de execução da tool.

## Matriz de Superfícies de UI

| Cenário do usuário | Entrada de UI | Fonte da option | Dono de exibição | Authority | Limite de modo | Deve permanecer isolado de |
| --- | --- | --- | --- | --- | --- | --- |
| Selecionar Skill em rascunho novo | `/`, aliases `$`/Yen | sem `sessionId` enquanto o prewarm não está pronto; com `prewarmSessionId` depois | hook React de escopo de requisição | catálogo atual do workspace ou snapshot do runtime de prewarm do rascunho atual | local/SSH/WSL/Docker vão todos para o Agent do workspace alvo; mobile reutiliza shared-host | não pode reutilizar o catálogo de Session da tarefa anterior; não pode alterar o estado das Settings |
| Selecionar Skill em Session existente | o mesmo | o mesmo protocolo com `sessionId` | hook React de escopo de requisição | catálogo congelado do runtime da Session | desktop continuous/mobile replayable só afetam a entrega, sem mudar a semântica do catálogo | não pode fazer hot load por adição no disco ou refresh das Settings |
| restart de runtime/cold resume | o mesmo | reenvia a mesma query de session após o restart do runtime | revision de runtime do hook | catálogo do novo runtime | mudança de attachment remote também faz parte da identidade da requisição | não pode exibir resultados atrasados do runtime antigo |
| Gestão de Skills | Settings | `skillsService.list()` | estado local das Settings | disco do workspace | usa o service existente do workspace alvo | não vira catálogo de session nem fica sujeito ao cache de conversa |

## Comportamento Compartilhado e Divergente

| Aspecto | Compartilhado | Deliberadamente diferente |
| --- | --- | --- |
| Picker | `/` e os aliases `$`/Yen compartilham o mesmo catálogo de Skill e o mesmo mapeamento | `/` continua agrupado com commands/Subagents; `$` exibe apenas Skills |
| Canônico | continua escrevendo o Markdown/texto canônico de Skill já existente | mudança de authority do catálogo não altera envio, edição, fila, retry nem fork |
| Descoberta | workspace e session são ambos gerados pelas regras de Skill discovery do CLI | workspace pega o disco atual a cada consulta; session lê o resultado já congelado do runtime |
| Recuperação | local e remote descartam resultados atrasados por identidade de requisição | desktop continuous e mobile replayable não compartilham cache do renderer |

## Donos de Estado e Destinos de Commit

| Estado/fato | Dono de rascunho/exibição | Dono autoritativo | Query/commit | Persistência/cache |
| --- | --- | --- | --- | --- |
| catálogo de Skill do workspace | hook do Picker | descoberta de filesystem/config/plugin do Agent do workspace | `skills/referenceCatalog` sem sessionId enquanto o prewarm não está pronto | apenas estado de requisição, sem cache persistente |
| catálogo de Skill da Session | hook do Picker | `AgentRuntime.skillLoadOutcome` | `sessionId` oficial ou `prewarmSessionId` do rascunho | congelado dentro do runtime resident; reconstruído em cold resume/prewarm de rascunho novo |
| catálogo de gestão de Skills | estado local das Settings | `ISkillsService` + arquivos/config | `skillsService.list/setEnabled/...` | arquivos e config existentes |
| menção de Skill | rascunho Lexical | user input da conversa | existing send command | texto canônico do transcript da sessão |

## Invariantes a Preservar

- `workspaceKey = workspaceIdentity?.trim() || workspacePath` cuida apenas do isolamento de identidade do workspace; `workspacePath` continua sendo usado na descoberta de arquivos de Skill.
- a identidade da requisição contém no mínimo workspaceKey, remoteSessionId, sessionId/prewarmSessionId/draft oficiais, revision de runtime e número de sequência da requisição; no primeiro frame após mudança de escopo a lista é limpa e resultados antigos falham de forma fechada.
- quando a query de Session não encontra a sessão, o protocolo gera erro; é proibido o fallback silencioso para a authority do workspace.
- refresh, instalação, remoção e ativação nas Settings invalidam apenas o runtime de rascunho ainda não promovido, sem atualizar por hot a Session resident existente.
- `/` e os aliases `$`/Yen não mantêm dois catálogos; o resultado da seleção continua usando a menção canônica de Skill já existente.
- relay e desktop main não são donos do catálogo de Skill, apenas repassam a query ao Agent do workspace alvo; esta mudança não altera a semântica do conversation stream `desktop-continuous` / `web-remote-replayable`.

## Relações da Feature

| Rank | De | Aresta | Para | Por que inspecionar | Evidência |
| --- | --- | --- | --- | --- | --- |
| must-inspect | catálogo de Skill da session | renders-in | Picker de Skill de `/` e `$` | as duas entradas precisam compartilhar a authority | `SlashCommandPlugin`、`skillsMentionProvider` |
| must-inspect | catálogo de Skill da session | served-by | `skills/referenceCatalog` | evita que a dupla varredura UI/CLI produza divergência de catálogo | testes de schema/handler/service do protocolo |
| must-inspect | catálogo de Skill da session | state-owned-by | `AgentRuntime.skillLoadOutcome` | fonte do fato congelado em Session quente | teste do runtime central |
| conditional | catálogo de Skill da session | recovers-via | restart de runtime/cold resume | o novo runtime precisa consultar de novo e resultados antigos não podem ser preenchidos | teste de restart de runtime do hook |
| invariant-only | catálogo de Skill da session | constrained-by | fronteira de entrega workspace/remote | local e remoto precisam acertar o Agent alvo | asserções de workspaceIdentity/remoteSessionId |

## Evidências do Codegraph

| Seed | Query | Chamadores diretos/caminho-chave | Profundidade | Interpretação |
| --- | --- | --- | --- | --- |
| `useSkills` | codegraph explore indisponível; fallback com `rg` focado | `SlashCommandPlugin`、`useSkillsMentionProvider` | 2 | as duas entradas atuais do Picker compartilham o store de nível workspace |
| `skillLoadOutcome` | fallback com `rg` focado | escrita por `ensureContextInitialized`, lida por context builder/Skill tool | 2 | o runtime resident já tem um catálogo congelado natural |
| `usePluginReferenceCatalog` | fallback com `rg` focado | Plugin mention provider → Agent protocol | 2 | implementação de referência já validada de authority workspace/session |

## Graph Drift e Delta

O feature graph existente declara apenas a surface de Skill por slash, sem state owner nem protocol service do catálogo de Skill por Session. Esta implementação adiciona `capability.session-skill-catalog`、`state.session-skill-catalog`、`service.skill-reference-catalog` e suas arestas semânticas com o Composer, o runtime de conversa e a fronteira workspace/delivery.

## Decisões de Fronteira e Casos Aceitos

| Fronteira | Decisão | Inclui | Exclui/poda | Fonte |
| --- | --- | --- | --- | --- |
| Hot update | Session resident não atualiza | nova Session antiga mantém o catálogo após adição manual de arquivo ou mudança nas Settings | sem file watcher | confirmação do usuário + guard de context do CLI |
| Nova tarefa | rascunho novo cria novo runtime de prewarm e, antes de ficar pronto, lê o catálogo atual do workspace | `SKILL.md` adicionado manualmente | não reutiliza o catálogo de Session/runtime da tarefa anterior | confirmação do usuário |
| cold resume | reescaneia com o novo runtime | restart do app/Agent, recuperação após resident eviction | não persiste permanentemente o catálogo antigo | implementação atual de resume do CLI |
| Superfície de gestão | mantém o catálogo em tempo real do workspace | todas as ações de gestão das Settings | sem chave de session | confirmação do usuário |

| Case ID | Setup | Ação | Asserções | Evidência | Status |
| --- | --- | --- | --- | --- | --- |
| S08-A | Skill adicionada manualmente antes da criação do rascunho novo/prewarm | abrir `/` e `$` | ambas as entradas exibem a Skill nova; antes do prewarm pronto a authority=workspace e depois é a do prewarm daquela Session | UI + protocolo | aceito |
| S08-B | Skill adicionada depois de S1 inicializada | abrir `/` em S1 e depois abrir `/` em um rascunho novo | S1 não exibe; o rascunho novo exibe | UI + runtime/protocol | aceito |
| S08-C | mudança do catálogo em disco antes/depois do restart do runtime de S1 | reabrir o Picker após o restart | descarta resultados antigos e exibe o catálogo do novo runtime | UI + evento de runtime | aceito |
| S08-D | troca de attachment/session remote com requisição antiga atrasada | trocar de escopo | limpa no primeiro frame; aceita apenas resultados do novo workspace/session/runtime | UI + params do service | aceito |
| S08-E | rascunho passa de sem prewarm para P1 pronto | manter/reabrir o Picker | a request key muda para P1; taskId continua null; aceita apenas o catálogo do runtime de P1 | Composer + hook | aceito |

## Verificação

- O Desktop E2E formal `conversation-session-v4-mention.test.ts` grava um `.zcode/skills/e2e-session-skill-catalog/SKILL.md` temporário em um workspace real: o `/` e o `$` da Session resident antiga não exibem aquela Skill; após clicar em nova tarefa, as duas entradas exibem o mesmo candidato canônico `skill:`.
- último artefato aprovado: `desktop-e2e-20260820-135214-127`. Essa VM representa S08-A/B de desktop local; restart de runtime, attachment remote, resultados atrasados de escopo e troca da chave de prewarm continuam comprovados por focused tests, sem passar por Desktop E2E combinações remotas/de restart não executadas.

## Questões em Aberto

Nenhuma. Se Subagent e command catalog devem adotar um ciclo de vida de Session semelhante não faz parte desta mudança e será auditado separadamente.