# Fase B: Encerramento da prova automatizada do refactor de Provider

> Status: implementação de automação concluída; as E2E críticas aguardam revisão humana e um ambiente gráfico/Docker disponível
>
> Atualização mais recente: 2026-08-25

## 1. Objetivo

Esta fase se limita a completar a evidência de automação que prova diretamente a correção do refactor de Provider, sem reestruturar
CI, workspace, Node, lockfile ou a baseline de formatter de todo o repositório.

```text
真实 Built-in Config 完整性
            |
            v
真实 Config 到 Active Model 纵向集成
            |
            v
Runtime 分支覆盖审计与补缺
            |
            v
Provider 关键 E2E 晋升
            |
            v
定向与全量回归验证
```

## 2. Prova automatizada

1. Ler diretamente o `config/provider/zcode-builtin.json` real, complementando com o material de acesso mínimo do período de execução
   para os Providers de API Key, Account e Request Auth, provando que cada Built-in Provider e cada membro de modelo é resolvido em
   um Registry Config completo.
2. Usar a Config Built-in real de ponta a ponta por Overlay, Resolver, Registry, ModelFactory e Adapter, provando que o Provider/Model
   Config final não é reinferido.
3. Reverificar que requisição comum, Compact, Memory, Subagent e Off-Peak consomem o mesmo Active Model; não recriar testes para fluxos
   que já têm evidência direta.
4. Concluir fixture, replay e portão de revisão humana dos quatro E2E pending de identidade de Provider, cold start do Registry, sub
   Agent de Off-Peak e filtragem de candidatos; sem confirmação humana, nenhuma promoção.

## 3. Limites dos testes

- Os testes de integridade não fixam totais de Provider, Rule ou Model e não exigem que uma Rule genérica acerte membros Built-in.
- O Built-in API Key Provider recebe a Key de teste por Personal Overlay; o Account Provider recebe accessId e o scope de Team
  necessário por Account Overlay; o Request Auth permanece injetado no período da requisição.
- Os testes podem referenciar fatos de configuração de fixação por ID de modelo real, mas o código de produção não pode fazer branch por
  ID de modelo específico.
- `support_pdf: false` e `support_audio: false` são entradas confirmadas nesta fase e não modificam fatos de configuração.
- Remote Provisioning, conta real, artefatos oficiais, upgrade de dados históricos, filas e semântica de recuperação não pertencem a
  esta fase.

## 4. Decisões de E2E

Os candidatos da primeira leva são:

- `conversation-session-same-model-draft-provider-identity`
- `conversation-session-provider-registry-prewarm`
- `conversation-session-offpeak-subagent-model-inheritance`
- `conversation-session-model-provider-list-filtering`

Esta fase não promove `model-switch-compact`, `model-switch-queue` nem `model-provider-session-isolation`. Os dois primeiros têm,
respectivamente, um problema conhecido de transporte/estado de produto e uma superfície cruzada de Queue mais ampla; o último fica
reservado para o trabalho dedicado ao ciclo de vida de sessão.

A revisão humana em 2026-08-25 confirmou as seguintes fronteiras de prova:

- A identidade de modelo de mesmo nome usa o `same-model-draft-provider-identity` existente: dois Providers expõem exatamente o mesmo
  modelId, usando IDs de Provider e Base URL diferentes; o valor de seleção composto, o estado selecionado do menu, a configuração do
  rascunho e a URL real da requisição devem manter o Provider alvo. O antigo `same-model-provider-identity` usa na verdade modelIds
  diferentes e só pode servir como cobertura de troca comum entre Providers, não como prova de isolamento de identidade de mesmo nome
  desta fase.
- A E2E de filtragem de candidatos usa amostras negativas representativas para provar que Provider oculto, Model oculto sob um Provider
  visível e Provider desabilitado ou incompleto não entram nos candidatos comuns; ao mesmo tempo, a cobertura com um Built-in Provider
  real do ZCode + Personal com o mesmo modelId prova que, em caso de conflito, o membro Built-in continua selecionável e enviável.
  Permutações repetidas e issue code continuam sendo provados por testes unitários do Resolver; a E2E não duplica todo o espaço de
  estados do Resolver.
- Em tarefas comuns, o Subagent sem modelo explícito herda o ModelFactory do pai, e o modelo explícito continua criando o seu próprio
  Model; Off-Peak é uma restrição de escopo de execução, e todo child em foreground deve continuar usando o Provider/Ticket/Request
  Auth de Off-Peak desta rodada, enquanto o child em background é rejeitado antes de enviar a requisição, e a mensagem comum após o fim
  da rodada de Off-Peak restaura o Provider do usuário.
- O prewarm do Registry, além de provider/model, toolbar e last-selected, precisa provar pela Base URL local do caso que a primeira
  requisição realmente atingiu o custom Provider configurado antes do cold start.

## 5. Critérios de conclusão

- Todos os Providers e membros de modelo da Config Built-in real são protegidos por teste permanente.
- Os três caminhos de API Key, Account e Request Auth têm evidência vertical da Config real até o Active Model.
- Requisição comum, Compact, Memory, Subagent e Off-Peak têm evidência automatizada explícita.
- As quatro E2E concluem a verificação automatizável de fixture/replay; somente os casos aprovados na revisão humana entram no diretório
  oficial e no preset de Docker.
- Os testes direcionados de Provider, o typecheck dos pacotes relacionados, o typecheck da raiz, o lint e a execução completa de unitários
  passam.
- Não restaurar as abstrações antigas de Provider/Model, hardcode de modelo específico em runtime nem uma segunda fonte de fatos de
  modelo.

## 6. Resultado da implementação

### 6.1 Evidência automatizada permanente

| Camada de prova                 | Evidência automatizada                                                                    | Resultado                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Integridade da Config Built-in real | `packages/provider-node/test/zcode-builtin-integrity.test.ts`                         | Passam os Providers do JSON real, os membros de modelo, o Overlay de material de acesso, o Model Config completo, os modelos de Off-Peak ocultos e a zeragem dos campos antigos |
| Caminho vertical de API Key     | `apps/zcode-cli/packages/bootstrap/tests/zcode-builtin-model-runtime-integration.test.ts` | `builtin:zai` entra no Adapter tal e qual, do Built-in + Personal Overlay via Resolver/Registry/ModelFactory |
| Caminho vertical de Account     | o mesmo                                                                                  | A restrição de membros de conta do Start Plan é efetiva e o Personal Provider Overlay mantém a última sobrescrita |
| Caminho vertical de Request Auth | o mesmo                                                                                 | O Provider de Off-Peak oculto pode ser criado com precisão pelo Registry comum, e o Request Auth Source só é vinculado no período de execução |
| Request Auth ausente            | `apps/zcode-cli/packages/adapters/tests/model.test.ts`                                   | generate/stream retornam `ModelRequestAuthMissing` antes de qualquer chamada de rede |
| Congelamento de Model           | `apps/zcode-cli/packages/bootstrap/tests/provider-registry-model-runtime.test.ts`        | Uma atualização do Registry só afeta Models criados depois                                        |

O teste de integração Built-in real apenas captura os parâmetros de criação do Adapter, não envia requisições de rede e não adicionou
Registry de execução, DTO de capacidade, snapshot de Provider nem API de produção exclusiva para testes.

### 6.2 Auditoria de cobertura dos ramos de Runtime

| Ramo de Runtime | Evidência direta                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requisição comum | `packages/adapters/tests/model.test.ts`、`packages/core/tests/runtime-model-lifecycle.test.ts`                                                                    |
| Compact         | `packages/core/tests/compact-media-capability.test.ts`、`packages/core/tests/compact-summary-model-request.test.ts`                                                   |
| Memory          | `packages/core/tests/memory-agent-loop.test.ts`、`packages/core/tests/runtime-memory-extraction.test.ts`                                                              |
| Subagent        | `packages/core/tests/subagent-inherited-model-factory.test.ts`                                                                                                        |
| Off-Peak        | `packages/core/tests/runtime-model-selection.test.ts`、`packages/bootstrap/tests/v4-native-commands.test.ts`、`packages/services/test/offPeakModelSelectionView.test.ts` |

Os testes acima já leem diretamente o mesmo Active Model ou ModelFactory, e não foi encontrada nenhuma lacuna que justificasse novo
branch de produção ou uma segunda fonte de fatos de modelo.
O conjunto direcionado relacionado à CLI totaliza 9 arquivos e 203 testes aprovados.

### 6.3 Status do portão das E2E críticas

Os manifests locais dos quatro casos pending e as fixtures de replay passaram na verificação mecânica. Os warnings não bloqueantes
atuais são três title fixtures sem marcador E2E e dois marcadores não cobertos da fixture de Off-Peak; eles não alteram a conclusão de
aprovação do contrato de fixture e ficam para a revisão humana decidir se é preciso completar pontos de observação.

O replay pending local já concluiu as builds de Desktop, CLI, Adapter e Bootstrap. A primeira execução expôs um conflito de parsing
do Zod causado por um estado antigo de instalação de dependências, resolvido com o `pnpm bootstrap` padrão do repositório; a segunda
execução passou pela build, mas o host não tem `xvfb-run`, Docker/Podman, e a sessão do Chrome WebDriver encerrou antes das páginas
de negócio e das asserções dos casos. Isso é registrado como bloqueio do ambiente de verificação, não como falha de produto, e não é
apresentado como replay verde. Os quatro casos continuam em `manual-review/pending`, sem promoção nem admissão em Docker executadas.

### 6.4 Resultados da regressão

- `@zcode/provider`: 13 arquivos, 115 testes aprovados; typecheck aprovado.
- `@zcode/provider-node`: 4 arquivos, 20 testes aprovados; typecheck aprovado. Os testes concorrentes de pacotes chegaram a fazer o
  teste existente de file watcher receber um `watch-error` extra, mas a reexecução seriada passou de forma estável, e o novo teste de
  integridade sempre passou.
- Services direcionado: 5 arquivos, 30 testes aprovados.
- Integração Bootstrap Built-in real: 1 arquivo, 3 testes aprovados.
- `pnpm typecheck` da raiz, `pnpm lint` e typecheck das E2E de Desktop aprovados; o lint mantém os warnings já existentes do
  repositório e zero error.
- `pnpm test:unit` da raiz: 1467 arquivos aprovados, 1 pulado; 12418 testes aprovados, 25 pulados.

Os únicos portões restantes são a revisão humana das quatro E2E pending, o replay oficial e a admissão em Docker. Eles precisam de um
ambiente gráfico/Docker para continuar e não precisam nem podem ser contornados reestruturando o código de produção do Provider.