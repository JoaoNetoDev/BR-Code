# Design do adaptador de modelo Kimi K3

## Contexto

O Kimi K3 já entrou na lista oficial de modelos da Moonshot. No lançamento, a documentação oficial da API só expunha `max`, então o ZCode inicialmente o modelou como um único nível fixo; a documentação mais recente dos modelos do Kimi Code já expõe três níveis `low` / `high` / `max`, e a política antiga impediria o usuário de escolher os novos níveis.

Ajuste dos nomes de modelo de produto em 2026-07-28:

- manter `kimi-k3`;
- adicionar `k3`, com capacidades idênticas às de `kimi-k3`;
- renomear o antigo `kimi-k3-256k` para `k3-256k`, sem registrar mais o nome antigo como modelo selecionável.

O log de execução local confirma que as requisições K3 atuais usam o transport `openai-compatible`; a documentação oficial da Moonshot deixa claro ao mesmo tempo:

- o model ID é `kimi-k3`;
- a janela de contexto é de `1,048,576` tokens, com suporte a entradas de texto, imagem e vídeo;
- `k3` e `kimi-k3` usam ambos contexto de `1,048,576` tokens;
- a janela de contexto de `k3-256k` é fixa em `262,144` tokens, e o restante das capacidades é idêntico ao de `kimi-k3`;
- o limite padrão de saída é de `131,072` tokens;
- o K3 suporta os três níveis `"low"` / `"high"` / `"max"`; o ZCode mantém o valor padrão existente `"max"`;
- um effort desconhecido devolve HTTP 400; `none` desliga o roteamento do K3 e faz fallback para outros modelos, por isso não é exposto como um nível do K3;
- o K3 não pode reaproveitar o parâmetro de toggle `thinking` do K2.x.
- Os endpoints OpenAI-compatible e Anthropic-compatible do Kimi Code suportam os três níveis do K3.
- A validação de argumentos de ferramentas do K3 só aceita `$ref` iniciados por `#/$defs/`; ferramentas MCP podem produzir referências reutilizadas apontando para `#/properties/...`, que precisam ser elevadas a `$defs` na fronteira de adaptação do modelo antes do envio.

Referências oficiais:

- https://platform.kimi.com/docs/guide/kimi-k3-quickstart
- https://platform.kimi.com/docs/models
- https://www.kimi.com/code/docs/en/kimi-code/models.html
- https://www.kimi.com/code/docs/en/kimi-code-cli/release-notes/changelog.html

## Objetivos

- Manter as capacidades base de `kimi-k3`, `k3` e `k3-256k` no catálogo de modelos da China e no snapshot models.dev embutido.
- Modelar os três modelos K3 como `low` / `high` / `max`, com padrão `max`, na política padrão da zcode-cli e no overlay dinâmico de providers do App.
- Nas requisições OpenAI-compatible, mapear o nível escolhido para `openaiCompatible.reasoningEffort`, com a AI SDK emitindo o `reasoning_effort` de nível superior.
- Nas requisições Anthropic-compatible, usar `anthropic.effort`, com a AI SDK emitindo `output_config.effort`; sem injetar `thinking.type` do K2.x.
- Ao enviar ferramentas nas requisições do K3, elevar referências JSON Pointer locais resolvíveis e fora de `$defs` para o `$defs` raiz e reescrever o `$ref` como `#/$defs/...`.
- Exibir na caixa de entrada três valores selecionáveis, “Baixo / Alto / Máximo”, sem exibir “Desligado”, “Médio” ou “Alto+”.

## Não objetivos

- Não reescrever o protocolo de pensamento existente para Kimi K2.5/K2.6/K2.7.
- Não continuar expondo `kimi-k3-256k`; esta mudança é uma renomeação de model ID, e não a inclusão de mais um slot de compatibilidade com o nome antigo.
- Não expor entradas de alias do Kimi (como `medium` / `xhigh`) como níveis na UI.
- Não modelar `none` como um nível de desligamento do K3; desligar muda o roteamento real do modelo, não é a profundidade de reasoning do K3.
- Não alterar os limites de mensagens de session/task do continuous do desktop e do replayable da Web no celular.

## Estado e cadeia de requisição

```text
中国模型目录 / CLI 默认策略
          │  kimi-k3: context=1048576
          │  k3: context=1048576
          │  k3-256k: context=262144
          │  三者: levels=["low", "high", "max"], default="max"
          ▼
App provider metadata
          │  精确命中的旧档位若是新目录档位的真子集，则扩展并写回
          │  非目录自定义档位保持不变
          ▼
workspace provider registry
          ▼
session.settings.thoughtLevel
          │  available=["low", "high", "max"]
          ▼
输入框展示“低 / 高 / 最高” ── 菜单和 Ctrl+T 在三档间循环

OpenAI-compatible: reasoningEffort=level ──► reasoning_effort="low|high|max"
Anthropic-compatible: anthropic.effort=level ──► output_config.effort="low|high|max"

工具 contract: $ref="#/properties/..."
          │  K3 adapter 提升引用目标到根 $defs
          ▼
provider wire: $defs={zcode_ref_0: ...}, $ref="#/$defs/zcode_ref_0"
```

As capacidades do modelo são a única fonte de verdade; a UI apenas deriva do número de options se há alternância, sem codificar o K3 pelo model ID e sem guardar estado React extra.

## Implementação

1. Atualizar `models_catalog_china_llm_zcode_2026-06-03.json`, preservando o contexto de 1M de `kimi-k3`, adicionando o `k3` com as mesmas capacidades e renomeando o modelo de 256K para `k3-256k`; os três modelos usam entrada multimodal, orçamento de saída de 131072 e os três níveis `low` / `high` / `max`, com padrão `max`.
2. Atualizar `apps/zcode-cli/api.json` e regenerar `models-dev-snapshot.ts`, garantindo que o catálogo puramente da CLI também obtenha as capacidades base dos três modelos K3.
3. A reasoning/default policy gera request patches de três níveis para o K3分别 nos formatos OpenAI-compatible e Anthropic-compatible.
4. O workspace dynamic provider overlay converge as capacidades do K3 por transport antes de ler os metadata de entrada, evitando que um `max` único ou um toggle de thinking genérico em configuração antiga contamine o resultado.
5. Ao ler o provider store, o App faz uma expansão unidirecional dos níveis de reasoning dos modelos exatamente presentes no catálogo: quando os níveis antigos são um subconjunto próprio dos níveis do novo catálogo, adota os novos e persiste; configurações customizadas do usuário que contenham níveis fora do catálogo não são sobrescritas. Assim, rascunhos de nova tarefa com `config.json` já existente também obtêm os três níveis.
6. O tool transform aplica a compatibilidade de schema do K3 conforme o modelo de destino: varre `$ref` locais resolvíveis, reutiliza a entrada de `$defs` do mesmo alvo de referência e não modifica o tool contract original; outros modelos mantêm o schema original.
7. Continuar reutilizando o controle de pensamento orientado por capacidades, sem codificar opções na UI pelo model id do K3.

## Testes

- adapter default policy: `kimi-k3` e `k3` com match exato de 1M, `k3-256k` com match exato de 256K;
  os três acertam visão/131072/reasoning de três níveis com padrão `max`, e `kimi-k3-256k` e
  K2.x não geram match indevido.
- models.dev catalog: os metadata dos três modelos K3 podem ser projetados a partir do fixture de snapshot.
- workspace provider protocol: nos dois transports, com e sem metadata antigo, são entregues três níveis e o request patch correspondente.
- App provider store: um `variants=["max"]` histórico é expandido e gravado de volta como `low/high/max`; um reasoning customizado com níveis fora do catálogo permanece inalterado.
- wire test: `low` / `high` / `max` geram `reasoning_effort` de nível superior em OpenAI-compatible e `output_config.effort` em Anthropic-compatible, e nenhum dos dois carrega `thinking` do K2.x.
- tool wire test: referências `#/properties/...` do K3 são elevadas ao `$defs` raiz e reescritas como `#/$defs/...`; outros modelos não são reescritos e o contract original não é modificado.
- Executar os testes direcionados, `pnpm typecheck` e `pnpm lint`.

## Briefing de impacto

### Feature Summary

| Field            | Value                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Developer intent | adicionar `k3` e renomear `kimi-k3-256k` para `k3-256k`                                 |
| Capability       | Model capabilities / model selection / provider registry                                 |
| Change layer     | `option-source`、`validation`                                                            |
| Operating mode   | planning                                                                                 |
| Primary seeds    | China LLM catalog、models.dev snapshot、model default policy、workspace provider overlay |
| Out of scope     | estado de session、semântica de commit da troca de modelo、replay de controle remoto、workspace identity |

### UI Surface Matrix

| User scenario               | UI entry                | Shared implementation                    | Display/draft owner     | Default/inherit source | Validation/gating       | Commit action                       | Authority/persistence                                    | Mode boundary                                              | Must remain isolated from        |
| --------------------------- | ----------------------- | ---------------------------------------- | ----------------------- | ---------------------- | ----------------------- | ----------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------- |
| Seleção de modelo na conversa | V4 composer             | provider registry / model option builder | session ou draft config | App provider config    | existe no registry e não está desabilitado | `switchModelConfig` ou draft config | Agent runtime / workspace default                        | continuous do desktop e shared host remoto web compartilham o registry | rascunhos de automação, Subagent e Repo Wiki |
| Automação, Subagent, Repo Wiki | respectivos seletores de modelo          | o mesmo provider registry                   | rascunho local de cada entrada | regras de herança existentes de cada entrada | existe no registry e não está desabilitado | o respectivo service                        | automation record / agent Markdown / generation settings | nenhum novo ramo de plataforma                                             | o modelo da conversa atual                     |
| Configurações de provider                  | Model Provider settings | model provider service                   | rascunho de edição do provider       | China LLM catalog      | catalog schema          | provider save                       | `~/.zcode/v2/config.json`                                | o workspace remoto continua com o registry sync existente                      | estado de negócio de session/task            |

### Shared And Divergent Behavior

| Concern              | Shared across surfaces                 | Deliberately different                                    | Why it matters for this change                  |
| -------------------- | -------------------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Option source        | todas consomem o model id do provider registry | cada entrada pode ter seu próprio filtro secundário                | model ids antigos e novos precisam convergir uma única vez na fonte unificada |
| Default/inheritance  | todas leem os metadata de capacidade do modelo | session, automation, Subagent e Repo Wiki têm donos de default diferentes | esta mudança não altera nenhuma seleção padrão                            |
| Commit effect        | todas submetem provider/model ref              | o commit sink de cada uma é independente                                                | só trocar o nome do candidato, sem alterar em cascata o estado de outras entradas                |
| Persistence/recovery | o App provider config é a origem do registry   | session/replay/rascunhos de negócio persistem por conta própria                         | não altera o limite desktop continuous / web replayable |

### Feature Relationships

| Rank           | From              | Semantic edge                   | To                                         | Condition             | Why inspect it                      | Evidence                     |
| -------------- | ----------------- | ------------------------------- | ------------------------------------------ | --------------------- | ----------------------------------- | ---------------------------- |
| must-inspect   | model catalog     | projects capabilities to        | provider registry                          | os três ids do K3     | determina os candidatos de UI e os metadata do App | testes de origem do catálogo |
| must-inspect   | provider registry | configures                      | CLI default policy / workspace overlay     | metadata ausente ou níveis antigos | ainda é preciso obter o context/reasoning correto | testes de adapter/bootstrap |
| must-inspect   | K3 model id       | selects compatibility transform | tool schema projection                     | os três novos ids de catálogo | a restrição de `$ref` do K3 não pode ser invalidada pela renomeação | testes de tool transform |
| should-inspect | provider registry | options-from                    | conversa, automação, Subagent, Repo Wiki   | depois do refresh do registry | todas as entradas devem ver o mesmo conjunto de novos nomes | grafo compartilhado de model-selection |
| invariant-only | model rename      | must not change                 | desktop continuous / web remote replayable | todos os workspaces  | esta mudança não altera o protocolo realtime de session/task | arquitetura atual |

### State Owners And Commit Sinks

| State/fact    | Draft/display owner           | Authoritative owner                  | Commit command/service | Persistence/cache             | Evidence               |
| ------------- | ----------------------------- | ------------------------------------ | ---------------------- | ----------------------------- | ---------------------- |
| Candidatos e capacidades do K3 | cada entrada de UI             | model provider service / CLI catalog | provider registry sync | App config / bundled snapshot | model provider docs    |
| Modelo da requisição atual    | composer / projeção de runtime  | Agent `defaultModelRef`              | session model switch   | session/runtime config        | chat model select spec |

### Must-Preserve Invariants

| Invariant                                | Surfaces/modes     | Proof needed                                  | Evidence                     |
| ---------------------------------------- | ------------------ | --------------------------------------------- | ---------------------------- |
| `k3` e `kimi-k3` têm capacidades idênticas além de id/name | catalog / CLI      | asserções de igualdade entre catálogo e default-policy | testes de service/adapter        |
| `k3-256k` só tem context 262144           | catalog / CLI      | asserções de capability                         | testes de service/adapter        |
| o antigo `kimi-k3-256k` não é mais registrado nem casa com a default policy | catalog / CLI      | asserções de ausência                            | testes de catálogo/default-policy |
| a mudança de nomenclatura não altera o commit sink de nenhuma entrada de UI | desktop/web/mobile | nenhuma modificação em código de UI/session/replay | revisão de diff |

### Codegraph Evidence

| Seed                                           | Query                           | Direct callers / key path                         | Depth | Interpretation                       |
| ---------------------------------------------- | ------------------------------- | ------------------------------------------------- | ----- | ------------------------------------ |
| `KIMI_K3_MODEL_ID` / `isKimiK3ModelId`         | explore / affected tests        | default policy、tool transform、workspace overlay | 2     | os três nomes de modelo devem ser expandidos de forma unificada |
| `loadLocalChinaLlmZCodeCatalog`                | explore / callers               | model provider service、store metadata migration  | 2     | o catálogo dirige ao mesmo tempo os candidatos e o preenchimento de metadata |
| `buildModelSelectGroups` / `useModelProviders` | graph declaration + live source | conversa、automação、Subagent、Repo Wiki          | 2     | origem de candidatos compartilhada, sem necessidade de alterar a UI |

### Graph Drift Candidates

| Candidate                   | Live-code evidence                                                | Missing/stale graph relation                       | Proposed follow-up        |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| model capability code seeds | K3 default policy、origem do catálogo e workspace overlay são a fonte de verdade atual | `capability.model-capabilities` não tem code seed preciso | acrescentar graph code seeds nesta rodada |

### Graph Delta

| Status    | Node/edge                                  | Semantic reason                       | Evidence               | Action             |
| --------- | ------------------------------------------ | ------------------------------------- | ---------------------- | ------------------ |
| confirmed | `capability.model-capabilities` code seeds | para que varreduras futuras de nomenclatura/capacidade de modelo acertem direto a fonte de verdade | implementação atual e decisão do usuário nesta rodada | atualizar o feature graph |

### Unresolved Questions

Nenhuma. O usuário já esclareceu os três nomes finais de modelo selecionáveis e a relação entre suas capacidades.

## Planejamento de casos

### Boundary Decisions

| Boundary     | Decision                   | Includes                                                           | Excludes / prunes        | Source           |
| ------------ | -------------------------- | ------------------------------------------------------------------ | ------------------------ | ---------------- |
| Conjunto final de modelos | `kimi-k3`、`k3`、`k3-256k` | catálogo、snapshot、default policy、dynamic overlay、tool transform | `kimi-k3-256k`           | decisão do usuário |
| Comportamento da UI      | muda apenas com os candidatos do registry     | todas as entradas que reutilizam a lista de modelos                                             | alterações de componente, interação e i18n da UI | implementação existente orientada por capacidades |
| delivery     | mantém os limites existentes               | desktop continuous、web remote shared-host registry                | novos estados realtime/session | restrição de arquitetura |

### Accepted Cases

| Case ID     | Setup                                  | Action                       | Assertions                              | Evidence layers      | E2E status |
| ----------- | -------------------------------------- | ---------------------------- | --------------------------------------- | -------------------- | ---------- |
| K3-NAME-001 | carregar o China LLM catalog                 | procurar os modelos K3                 | apenas os três ids finais, com a relação de capacidades correta | service unit         | not-needed |
| K3-NAME-002 | desabilitar o models.dev e usar só a default policy | consultar os três ids finais e o id antigo de 256K | capacidades corretas nos três ids finais e nenhum match no id antigo | adapter unit         | not-needed |
| K3-NAME-003 | carregar o snapshot models.dev embutido       | consultar os modelos Moonshot           | os três ids finais existem e o id antigo não | adapter integration  | not-needed |
| K3-NAME-004 | provider dinâmico sem metadata do K3         | upsert de `k3` / `k3-256k`      |合成 de três níveis de reasoning por transport | protocol integration | not-needed |
| K3-NAME-005 | tool contract do K3 com `$ref` local         | projetar `k3` / `k3-256k` separadamente    | o `$ref` é elevado para `$defs` e o contract original não muda | adapter wire unit    | not-needed |

Não se adiciona E2E de conversation: o commit da seleção de modelo, o estado de session e a semântica realtime/replayable não mudaram; catálogo, default policy, overlay de protocolo e transform de wire já estão cobertos diretamente por testes unitários/integrados em camadas.