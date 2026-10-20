# PRD — Sub-agentes roteados por modelo

- **Status:** Rascunho para aprovação
- **Data:** 2026-10-18
- **Área:** runtime de sub-agentes (`apps/zcode-cli`), empacotamento de plugin, `packages/shared`, `packages/services`, `packages/ui`
- **Slug:** `subagentes-roteados-por-modelo`
- **Referência de produto:** `E:\Develop_apps\LionLabs\Raspagem` (principalmente `LionCodeLabs`, sistema de sub-agentes com broker e roteamento por modelo)

---

## 1. Problema e evidência

O fork **já possui** a capacidade de criar sub-agentes com um modelo próprio, e ela funciona ponta a ponta. O que não existe é a camada que torna isso útil: um catálogo de sub-agentes de papel com modelos escolhidos, e um catálogo de roteamento que o agente principal consiga usar para decidir.

### 1.1 O que já existe (verificado — não é o problema)

| # | Capacidade existente | Local verificado |
|---|----------------------|------------------|
| C1 | Criar sub-agente pela UI (nome, descrição, prompt de sistema, **seletor de modelo**) | `packages/ui/src/settings/SubagentsSection.tsx:1412-1444` (`handleSave` → `createAgent` em :1427) e o picker de modelo no formulário do mesmo arquivo |
| C2 | O `modelSelection` do perfil é de fato aplicado ao runtime filho, cross-provider | `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts:104-117` (seleção) e `:204` (`childModel = baseChildModelFactory({ selection: childSelection })`) |
| C3 | Herança: sem `modelSelection` no perfil, o filho herda o modelo ativo do pai | `apps/zcode-cli/packages/core/src/runtime/helpers/subagent-selection.ts:26-31` |
| C4 | Markdown aceita `model:` + `thoughtLevel:`, com `inherit` como valor neutro | `packages/shared/src/subagent-markdown-selection.ts:8` (`INHERIT_NAMES`) e `:11-35` |
| C5 | `subagent_type` é string aberta — sub-agentes custom são despacháveis | `apps/zcode-cli/packages/contracts/src/tools/agent.ts:21-24` |
| C6 | Sub-agentes de plugin são empacotáveis em `agents/<nome>.md` | `apps/zcode-cli/packages/bootstrap/src/subagents.ts:95-110` e o exemplo real `apps/zcode-cli/packages/pdf-plugin/agents/visual-judge.md:1-6` |
| C7 | Overrides de modelo por sub-agente persistidos por id estável | `packages/shared/src/subagents-types.ts:139-155` (`BuiltInSubagentModelOverrideParams`, `createPluginAgentStateId`) |

### 1.2 O problema

**P1 — Só existem dois sub-agentes genéricos.** Os built-ins são `general-purpose` e `Explore`, criados em código (`apps/zcode-cli/packages/core/src/subagent/profile.ts:23-38` para `Explore` e `:72-88` para `general-purpose`). O único sub-agente de papel existente em toda a árvore é `visual-judge`, e ele existe apenas porque os plugins de artefato o empacotam (`apps/zcode-cli/packages/pdf-plugin/agents/`, e o mesmo nos plugins `documents`, `presentations`, `spreadsheets`). Não há catálogo curado de papéis como revisor de código, pesquisador ou executor de testes. Um usuário que abre o produto pela primeira vez não tem nenhum sub-agente de que valha o despacho.

**P2 — O catálogo injetado no agente principal é pobre.** O que chega ao pai é uma linha por sub-agente no formato `- <nome>: <descrição> (Tools: a, b)` (`apps/zcode-cli/packages/core/src/subagent/profile.ts:102-113`), injetada como `<system-reminder>` sintético persistido (`apps/zcode-cli/packages/core/src/subagent/listing.ts:14-46` e `:59-74`). Faltam três coisas que determinam a decisão de roteamento: (a) quando usar cada um; (b) em que modelo ele roda e a que custo; (c) a relação entre sub-agentes concorrentes — quando escolher um e não o outro. No projeto de referência, `description` é explicitamente o campo de roteamento ("Quando usar — roteia o agente principal", `LionCodeLabs/shared/src/subagent.ts:91`) e a tool `call_subagent` recebe o catálogo como enum de nomes (`LionCodeLabs/mcp-servers/lioncode-subagents/src/index.ts:187-198`).

**P3 — Falha dura quando o modelo do sub-agente fica indisponível.** Se o `providerId`/`modelId` gravado no perfil deixar de resolver — conta desconectada, provedor desabilitado, modelo removido, nível de raciocínio removido — a chamada `Agent` inteira falha no spawn, com `ConfigurationError` recuperável e sem degradação (`apps/zcode-cli/packages/core/src/runtime/helpers/subagent-selection.ts:26-53`; reasons em `packages/shared/src/model-selection.ts:21-29`). Isso é **decisão deliberada e documentada** (`subagent-selection.ts:33-35`: não cair para o modelo do pai porque isso mudaria silenciosamente o modelo escolhido pelo usuário). O efeito prático, porém, é que deslogar de uma conta quebra todos os sub-agentes que apontam para ela, e o usuário recebe erro em vez de comportamento. O projeto de referência degrada para o modelo padrão do provedor (`LionCodeLabs/packages/server/src/runner/delegate.ts:373-379`, `:431-444`).

**P4 — Fixar modelo de catálogo a um provedor de conta é frágil neste fork.** O sub-agente `visual-judge` fixa `model: account:bigmodel-individual-coding-plan/GLM-5.3-Flash` (`apps/zcode-cli/packages/pdf-plugin/agents/visual-judge.md:5`). Para provedores do tipo plano de conta, o `providerId` gravado no perfil é **reescrito silenciosamente** para a única conta conectada no momento (`packages/provider/src/effective-model-selection.ts:27-40`); com zero ou mais de uma conta, o resultado é `account-connection-unavailable` (`effective-model-selection.ts:33-38`). Ou seja: o id de provedor no frontmatter não é um contrato estável, e um catálogo que dependa dele entrega uma experiência que quebra conforme o usuário troca de conta. Isso é reforçado pelo rascunho de remoção do tratamento preferencial de Z.ai/BigModel na UI (`docs/features/paridade-provider-zai-ui/PRD.md`).

---

## 2. Usuários e cenários de uso

**U1 — Usuário de um único modelo.** Quer que revisões de código e buscas exploratórias não queimem o mesmo orçamento do modelo caro que está respondendo. Hoje teria de abrir Settings → Subagents, criar cada perfil à mão e escolher o modelo em cada um. Não sabe quantos criar nem para quê.

**U2 — Usuário multi-provedor.** Trabalha com um modelo de código caro e tem uma conta com modelo rápido/barato. Quer que o agente principal use o barato para o mecânico (busca, leitura de log, extração) e o caro para o difícil, sem editar configuração a cada tarefa.

**U3 — Autor de plugin.** Quer distribuir um sub-agente de papel dentro de um plugin, com modelo e ferramentas fixos, funcionando para qualquer usuário que instale o plugin — sem exigir que ele configure nada.

**U4 — Usuário desconectado de uma conta.** Configurou sub-agentes apontando para um provedor; deslogou. Espera que a conversa continue funcionando, com aviso claro do que mudou.

Cenários:

- **Cenário A (U1, primeiro uso):** o usuário pede "revise o diff do PR 412". O agente principal reconhece que existe um sub-agente de revisão, despacha para ele, e o sub-agente roda no modelo escolhido pelo catálogo, não no modelo do pai. O usuário não configurou nada.
- **Cenário B (U2, sessão longa):** o agente principal precisa varrer 40 arquivos para achar onde um símbolo é usado. Despacha o sub-agente de pesquisa no modelo barato; o resultado volta; a análise final acontece no modelo do pai, no modelo caro. O usuário não percebeu nada além de a resposta ter sido boa e barata.
- **Cenário C (U3):** instala um plugin; o sub-agente do plugin aparece na lista com nome, descrição de quando usar, modelo e ferramentas.
- **Cenário D (U4):** está com a conta desconectada; o agente despacha o sub-agente e recebe um aviso de que rodou em modelo de fallback, não naquele configurado.

---

## 3. Objetivos e não-objetivos

### Objetivos

- **O1** — Entregar um catálogo curado de sub-agentes de papel, disponível sem configuração do usuário, com **escopo, ferramentas e política de modelo definidos** — sendo que "modelo definido" significa *modelo resolvido de forma determinística e explícita para o usuário* (herança do pai, ou override manual que ele vê), **não** um modelo fixado no pacote (ver RF-03 e a nota de viabilidade).
- **O2** — Fazer com que o agente principal **roteie com qualidade**, com orientação explícita de quando usar, informação de modelo/custo e desambiguação entre sub-agentes concorrentes.
- **O3** — Tornar a degradação de modelo previsível e visível, sem travar a conversa.
- **O4** — Manter o fork sem tratamento preferencial de provedor: o catálogo não pode depender de provedor de conta específico.

### Não-objetivos

- **N1** — Não mudar o `Agent` tool para permitir o pai escolher o modelo na chamada. A remoção é deliberada e documentada (`apps/zcode-cli/packages/contracts/src/tools/agent.ts:25-26`: expor `model` ao pai faz histórico de tool call gerar override obsoleto). Fora de escopo permanente.
- **N2** — Não introduzir sub-agentes recursivos (um sub-agente que despacha outro). O projeto de referência também proíbe (`LionCodeLabs/packages/server/src/runner/delegate.ts:951-952`).
- **N3** — Não construir worktrees, lanes de concorrência ou broker de delegação como no Raspagem. O fork tem um modelo de concorrência próprio e não precisa dele para este objetivo.
- **N4** — Não persistir histórico de execução de sub-agente em banco ou log em disco. O fork já projeta o filho na timeline do pai.
- **N5** — Não tocar em `.agents/skills/`, no motor de workflow (`dynamic-workflows`) ou no `Task` alias Claude-compat.
- **N6** — Não decidir sozinho a política de degradação em código antes de o usuário fechar a questão aberta da Seção 8 (Q1).

---

## 4. Requisitos funcionais

### Catálogo curado (O1)

- **RF-01** — O produto deve fornecer um conjunto de sub-agentes de papel, cada um com `name`, `description`, prompt de sistema, `tools`, `permissionMode` e política de modelo, empacotados de forma versionada (plugin do fork), não hardcoded no CLI.
- **RF-02** — O catálogo deve cobrir, no mínimo, os papéis: revisão de código, pesquisa/busca ampla, execução e triagem de testes, e sumarização de informação longa. Cada papel precisa ser distinguível de `general-purpose` por propósito declarado.
- **RF-03** — Sub-agentes de catálogo **não fixam modelo**: o campo `model` fica ausente do frontmatter e o sub-agente herda o modelo do pai (`subagent-markdown-selection.ts:8-10`, `core/src/runtime/helpers/subagent-selection.ts:26-31`). O controle de custo e de escopo vem das ferramentas e do `permissionMode`, não de fixar um modelo.
  - **Nota de viabilidade:** o formato atual é estritamente absoluto — `parseModelPickerValue` exige `providerId/modelId` com separador `/` e lança erro sem ele (`packages/shared/src/model-selection.ts:45-52`). **Não existe conceito de "família", tier ou rebaixamento automático de modelo** no frontmatter; os únicos caminhos são valor absoluto ou os nomes neutros de herança (`subagent-markdown-selection.ts:8`). Um "rebaixar o modelo do pai para uma categoria mais barata" seria um conceito novo, com resolução e produto próprios, e está **fora do escopo desta feature**. O override manual do usuário (RF-05) é o caminho suportado hoje para escolher um modelo diferente do pai.
- **RF-04** — Um sub-agente de catálogo deve poder ser desabilitado pelo usuário sem editar arquivo, e desabilitá-lo não pode afetar os demais.
  - **Estado atual:** o toggle existe e é persistido sem tocar arquivo (`packages/shared/src/subagent-runtime-config.ts:8-10`, operado em `packages/services/src/subagents/subagentsService.ts:675-684`). **Porém ele só alcança perfis de usuário/projeto** — `disabledAgentIds` tem um único produtor e um único consumidor, ambos em `bootstrap/src/subagents.ts:70` e `:71-84`, alimentando apenas o loader de usuário/projeto; **perfis de plugin nunca passam por esse filtro** (`bootstrap/src/app/create-app.ts:263` e `:800-815` concatenam os perfis de plugin fora dele). **Habilitar o toggle para essa fonte é trabalho novo da Release 1, e exige tocar o runtime — não é só UI.**
- **RF-05** — O override manual de modelo definido pelo usuário tem precedência sobre a política do catálogo, e essa precedência precisa ser preservada na UI e no estado persistido.

### Roteamento (O2)

- **RF-06** — O catálogo injetado no agente principal deve conter, por sub-agente: nome, quando usar, quando **não** usar, ferramentas e uma **indicação de custo relativo** (ex.: "herda o modelo atual; escopo restrito a N ferramentas"). O identificador do modelo concreto só deve aparecer quando o usuário tiver definido um override, e **nunca deve expor `providerId`** — ver RF-15. O formato atual `- nome: descrição (Tools: …)` (`core/src/subagent/profile.ts:102-113`) é insuficiente e deve ser estendido.
- **RF-07** — A listagem injetada deve cobrir as tarefas comuns (revisão de diff, varredura de codebase, triagem de testes) com um sub-agente de catálogo adequado para cada, sem que o pai precise deduzir por nome. **Verificável por:** para cada uma dessas três tarefas existe exatamente uma linha de catálogo cuja seção "quando usar" a nomeia, e um teste afirma que essa linha está presente no delta inicial injetado.
- **RF-08** — A listagem deve continuar sendo custo-zero por turno quando nada mudou — o delta atual só é emitido quando há adição/remoção real (early-return em `core/src/subagent/listing.ts:38`) e esse comportamento deve ser preservado.
- **RF-09** — Quando o usuário muda o modelo de um sub-agente na UI, o pai deve enxergar a nova linha **sem que o usuário precise pedir nova listagem, reenviar a tarefa ou reiniciar a sessão**.
  - **Estado atual (lacuna):** hoje `announced` é reconstruído do histórico e o diff é feito **só sobre nomes** (`core/src/subagent/listing.ts:22-28` e `:33`), então mudar o modelo não altera o conjunto de nomes e **nenhum delta é emitido** — o pai continua vendo a linha antiga indefinidamente.
  - **Limite conhecido (corrigido na fase TECH):** o snapshot de definições é congelado no início de cada turno (`apps/zcode-cli/packages/core/src/subagent/definitions.ts:15-29`: `prepare()` roda no início do turno e faz `snapshot = structuredClone(next)`; `get()` devolve esse snapshot durante o turno), e a coleta roda uma vez por turno (`core/src/runtime/methods/turn-loop.ts:126`). Portanto **não é possível** que a mudança apareça dentro do turno em que foi salva. O requisito é atendido **no turno seguinte, automaticamente, sem ação do usuário** — o que é o comportamento útil.
  - **Verificável por:** um teste verifica que, após salvar o override, o turno seguinte produz a linha com o modelo novo, sem nenhuma ação adicional do usuário.
- **RF-10** — A UI de Settings → Subagents deve mostrar, por sub-agente, a origem do modelo: **herdado do pai** ou **sobrescrito manualmente**.
  - **Nota de escopo:** o PRD previa um terceiro rótulo, "definido no catálogo", mas RF-03 proíbe o catálogo de fixar modelo — nenhum agente de catálogo terá modelo próprio, então esse rótulo **nunca apareceria**. Fica para o Release 2, caso a política de degradação passe a definir um modelo de fallback que o usuário precisa enxergar.
  - **Verificável por:** um teste de render da seção afirma que as duas situações exibem rótulos distintos, e que o rótulo de "sobrescrito manualmente" sobrevive a um reload do runtime (o override é persistido por id estável, `packages/shared/src/subagents-types.ts:154-156`).

### Degradação (O3)

- **RF-11** — Quando o modelo configurado de um sub-agente não resolver no spawn, o sistema deve aplicar a política de degradação fechada na Seção 8 (Q1) e **nunca** falhar a chamada `Agent` de forma não explicada. **Verificável por:** para cada `selectionIssue` da política fechada (`packages/shared/src/model-selection.ts:21-29`), um teste injeta a falha de resolução e afirma o resultado — ou a degradação com aviso, ou a falha com mensagem que nomeia o `reason`.
- **RF-12** — Sempre que houver degradação, o usuário deve ver um aviso explícito dizendo: qual modelo foi configurado, qual foi usado e por quê.
- **RF-13** — O aviso de degradação deve ser distinto de erro de ferramenta, para não poluir o histórico como falha.
- **RF-14** — Um sub-agente de catálogo sem modelo fixo não degrada por seleção própria: ele herda o mesmo `providerId/modelId` do pai e, portanto, o mesmo risco de ambiente — uma mudança de estado da conta entre a resolução da sessão e o spawn do filho afeta pai e filho igualmente (`core/src/runtime/methods/subagent.ts:106-111`). Ele não pode ser a origem de uma degradação que o pai não sofreria.

### Ausência de preferência de provedor (O4)

- **RF-15** — Nenhum sub-agente de catálogo pode fixar `providerId` do tipo plano de conta. Se o modelo precisar ser rebaixado em relação ao pai, a forma de fazer é não fixar modelo e fixar `tools`/`permissionMode` mais restritivos, ou usar override manual do usuário. **Verificável por:** um teste que falha se qualquer `agents/*.md` do pacote de catálogo declarar `model:` apontando para um `providerId` classificado como plano de conta.
- **RF-16** — O catálogo e a UI não podem apresentar nenhum provedor como "o oficial", alinhados a `docs/features/paridade-provider-zai-ui/PRD.md`.

---

## 5. Requisitos não-funcionais

- **RNF-01 (Custo de contexto)** — O delta inicial é injetado de uma vez, sem paginação e sem teto de linhas hoje (`core/src/subagent/listing.ts:14-46`). **Paginação fica fora do Release 1:** com 4 papéis de catálogo, o delta inicial fica na casa das dezenas de linhas, muito abaixo do orçamento de 40. Paginação vira trabalho futuro, acionado por um número real de papéis, não antecipadamente. Orçamento mantido: no máximo 40 linhas de catálogo injetadas por vez; o que exceder precisa ser alcançável por busca, não injetado.
- **RNF-02 (Latência)** — Montagem do catálogo não pode introduzir I/O de disco no caminho quente do spawn: **0 operações de arquivo por chamada do `Agent`** e **< 2 ms p95** de montagem, medido contra a baseline. Hoje o único memo no caminho é o `childModel` por sessão (`core/src/runtime/methods/subagent.ts:204-210`).
- **RNF-03 (Observabilidade)** — O modelo efetivo de cada sub-agente deve continuar visível em runtime (hoje ecoado no evento `SubagentSpawned`, `core/src/subagent/runner.ts:252-254`), e um evento de degradação precisa existir no mesmo caminho.
- **RNF-04 (Acessibilidade e i18n)** — Todo texto novo de UI vai por `packages/ui/src/i18n/locales/` nos locales existentes, e a listagem injetada no pai é texto de sistema para o modelo — precisa estar em um único ponto de construção testável, não espalhada em template strings.
- **RNF-05 (Compatibilidade)** — Perfis de usuário/projeto existentes, com e sem `model`, continuam carregando sem mudança de comportamento. A mudança de formato da listagem é interna ao prompt do pai.
- **RNF-06 (Segurança)** — `permissionMode` do catálogo nunca pode ser `bypassPermissions` sem justificativa por papel e sem aprovação explícita do usuário.
- **RNF-07 (Idempotência de refresh)** — Mudar o modelo de um sub-agente não pode gerar laço de atualização de catálogo (mesma armadilha de proteção contra loop já tratada para tema/idioma).

---

## 6. Métricas de sucesso

- **M1** — Das sessões com 5 ou mais turnos que contêm pedido de revisão de código, varredura de codebase ou triagem de testes, pelo menos 70% registram ao menos um despacho a sub-agente de catálogo. Instrumentado pelo evento `SubagentSpawned` já existente (`core/src/subagent/runner.ts:240`), sem telemetria nova.
- **M2** — ≥ 80% dos sub-agentes de catálogo despachados rodam sem erro de seleção numa base com conta desconectada. **Denominador:** despachos a sub-agente de catálogo em ambiente sem conta de provedor de conta conectada, janela de 7 dias, mínimo de 30 despachos para a métrica contar como válida (abaixo disso, reporta-se como amostra insuficiente).
- **M3** — O overhead de tokens da listagem injetada ≤ 3% do prompt do sistema. **Ponto de medição:** campo de mensagens do payload de requisição que carrega a listagem injetada; **denominador:** o system prompt completo do mesmo payload.
- **M4** — Nenhuma regressão de tempo de spawn do `Agent` acima de 5% contra a baseline. **Existem E2E que disparam `subagent_type`** (ex.: `conversation-session-subagent-prompt-assembly.test.ts`, `conversation-session-subagent-runtime-catalog-reasoning.test.ts`, em `packages/desktop/test/e2e/conversation-session/`), mas **nenhum cronometra o spawn**, então **a medição em si é um entregável da Release 1**: um caso que dispara `Agent` com `subagent_type` e mede o tempo de spawn contra a baseline.

Nenhuma métrica exige coleta de telemetria de usuário ou envio de conteúdo para fora — todas derivam de contagens de evento e tamanho de payload já disponíveis localmente.

---

## 7. Escopo de release e faseamento

**Release 1 — Catálogo e roteamento (RF-01 a RF-10, RF-15, RF-16, RNF-01 a RNF-07).** Entrega valor isoladamente: o usuário passa a ter sub-agentes de papel e o pai passa a rotear bem. Não toca na política de seleção.

**Release 2 — Degradação (RF-11 a RF-14).** Só depois que a Release 1 esteja em uso e a Questão Q1 estiver decidida. É a parte que mexe numa decisão deliberada de projeto e precisa do aval explícito do usuário (ver Seção 8, Q1).

Fora dos dois releases: worktrees, lanes, broker, delegação em background, histórico de execução.

---

## 8. Riscos e questões em aberto

### Riscos

- **RK-01 (alto)** — Colidir com o trabalho de paridade de provedor. Existe na mesma máquina um PRD **em rascunho, ainda não aprovado** (`docs/features/paridade-provider-zai-ui/PRD.md:3`) que remove o tratamento preferencial de Z.ai/BigModel na UI; um catálogo que fixe `account:bigmodel-individual-coding-plan` reintroduziria a dependência pelo outro lado. Mitigação: RF-15 (catálogo sem provedor de conta, com teste) + revisão cruzada contra o PRD de paridade antes da Release 1 fechar, seja qual for a decisão dele.
- **RK-02 (alto)** — A Release 2 mexe na única barreira que garante "o modelo configurado é o modelo usado". Mitigação: degradação **visível** (RF-12) e nunca silenciosa; se o usuário proibir degradação explícita, a Release 2 não acontece e o PRD fecha aí.
- **RK-03 (médio)** — Catálogo grande demais inflando o contexto do pai (RNF-01). Mitigação: orçamento explícito e paginação.
- **RK-04 (médio)** — Sub-agentes de catálogo com `permissionMode` permissivo virando brecha. Mitigação: RNF-06.
- **RK-05 (baixo)** — Prompts do catálogo envelhecem e a qualidade de roteamento cai sem sinal. Mitigação: M1 mede a queda.

### Questões em aberto

- **Q1 (bloqueante para Release 2) — Política de degradação.** Manter falha dura (status quo, `subagent-selection.ts:26-53`), degradar sempre com aviso visível (como o Raspagem, `delegate.ts:373-379`), ou degradar só indisponibilidade de conta e continuar falhando em configuração inválida? **Recomendação:** degradar só indisponibilidade de conta (`account-connection-unavailable`), mantendo falha dura para `provider-not-found` / `model-not-found` / `reasoning-level-*`. Motivo: deslogar é evento de ambiente, reversível e do usuário; um id de modelo inválido é erro de configuração que silenciar esconderia. **Precisa de decisão do usuário.**
- **Q2 — Quantos papéis no catálogo inicial.** Parto de 4 (RF-02). Mais papéis resolvem mais casos, mas cada um paga contexto em todo delta inicial (RK-03).
- **Q3 — O catálogo é um plugin do fork ou `.zcode/agents/` versionado neste repo?** Parto de plugin: segue o padrão já existente (`pdf-plugin/agents/`), sobrevive a upgrade do CLI e pode ser desabilitado como unidade. Confirmar antes da SPEC.
- **Q4 — O override manual sobre catálogo deve gerar aviso?** Hoje o usuário pode trocar o modelo de um sub-agente de catálogo e nada o diz (RF-05 cobre precedência, não comunicação).

---

## 9. Rastreabilidade

| Requisito | Atendido em |
|-----------|-------------|
| RF-01…RF-05 | Release 1 — SPEC seção 2 (catálogo), TECH seção 2 |
| RF-06…RF-10 | Release 1 — TECH seção 2 (roteamento), SPEC seção 3 |
| RF-11…RF-14 | Release 2 — bloqueado por Q1 |
| RF-15, RF-16 | Release 1 — gate de revisão cruzada com `paridade-provider-zai-ui` |
| RNF-01…RNF-07 | Release 1, salvo RNF-03 (parcial: Release 1 cobre eco do modelo; evento de degradação é Release 2) |