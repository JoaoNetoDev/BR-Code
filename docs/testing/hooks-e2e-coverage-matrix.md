# Hooks E2E Coverage Matrix

## Feature Summary

| Campo                  | Valor                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Mudança                | Fazer com que os 7 eventos de Hook existentes formem um ciclo de vida completo configurável, executável, observável e regressável |
| Superfícies visíveis ao usuário | Settings > Hooks; conversation runtime; origem de plugin hook somente leitura |
| Documentos existentes  | `docs/hooks-runtime-contract.md`, `docs/hooks-implementation-analysis.md`, `docs/plugin-hooks-compat.md` |
| Owners existentes      | Agent HookRunner/configured runner; HooksService; HooksSection; plugin protocol                             |
| Fora do escopo         | eventos novos; prompt/agent/http; `if`, `once`, `asyncRewake`; execução implícita legacy                      |

## Clarification Log

| Rodada | Pergunta                                             | Resposta do usuário                                                                                      | Fronteira fixada                            | Seguimento necessário |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------- |
| 1      | Se esta entrega se expande para todos os tipos de evento de hook | "目前只支持这 7 个已有的 hook" (no momento só estes 7 hooks existentes são suportados)                                                            | Cobrir apenas os 7 eventos existentes       | não                  |
| 1      | Se deve validar evento a evento e adicionar um E2E de lifecycle do conjunto | "确保这 7 个 hook 都是能用的，挨个测试，对 hook 整体的能力添加一个 e2e case lifecycle 测试" (garantir que estes 7 hooks funcionem, testando um a um, e adicionar um caso e2e de lifecycle para a capacidade do conjunto de hooks) | 7 casos de contrato focados + 1 caso combinado em nível de janela | não                  |
| 0      | Como tratar a página de configurações e a origem      | implementar conforme o esquema já confirmado                                                              | `.zcode` editável, plugin somente leitura, import explícito de legacy | não                  |

## Domain Scope

| Domínio                  | Incluído?            | Razão                                                              | Fontes primárias                                            |
| ------------------------ | -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Agent runtime/config     | sim                  | decide se o Hook realmente executa e afeta turn/tool              | `apps/zcode-cli/packages/{contracts,core,adapters,bootstrap}` |
| Permission/tool          | sim                  | os 4 eventos de tool atravessam validação, permissão e sucesso/falha | `apps/zcode-cli/packages/core/src/tool/executor`              |
| Conversation/session     | sim                  | SessionStart, UserPromptSubmit e Stop ficam no lifecycle do turn   | `apps/zcode-cli/packages/core/src/runtime`                    |
| Settings UI/source       | sim                  | o usuário precisa configurar `.zcode` e ver plugin hooks           | `packages/{services,ui}`                                      |
| Mobile remote/replayable | apenas representativo | o Hook executa no Agent runtime compartilhado e não altera semântica de stream/snapshot/queue | invariant de arquitetura              |

## State Owners

| Estado / fato                  | Autoridade                            | Espelhos / caches        | Evidência                                       |
| ------------------------------ | ------------------------------------- | ------------------------ | ----------------------------------------------- |
| Configuração de Hook da session atual | snapshot do Agent runtime       | visão de arquivo da Settings UI | eventos de runtime, arquivo de trace do Hook    |
| Configuração de Hook em `.zcode` | arquivo de config do usuário; o projeto só exibe/edita | hooksStore   | round-trip de arquivo, teste de service/runtime |
| Estado efetivo do Hook de plugin | resolver de plugin do Agent          | pluginManagementStore    | payload de `plugins/list`, trace de runtime      |
| Resultado da execução do Hook   | HookRunner + consumidor específico do evento | projeção de evento da sessão | resultado de tool/model request/arquivo de trace |

## Dimensions And Pruning

| Dimensão      | Valores                     | Decisão                                                                 | Razão                                    |
| ------------- | --------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| Evento        | 7 eventos existentes        | todos aceitos                                                             | o usuário exigiu que funcione um a um    |
| Origem do Hook | user/project/plugin/legacy  | runtime de user+plugin; project/legacy não executa                       | evita execução silenciosa de qualquer comando do workspace |
| Tipo de Hook  | process/command              | aceito                                                                   | o runtime atual já tem esse tipo         |
| Modo de execução | process/command sync/async | o E2E percorre argv real, shell e fire-and-forget separadamente          | a capacidade do executor precisa de evidência em nível de janela |
| Cliente       | desktop/mobile Web           | o E2E representa desktop-continuous; a UI compartilhada faz testes responsivos/de tipo | não muda o estado de negócio do mobile replayable |
| Plataforma    | macOS/Linux/Windows          | argv/shell por unit test do ExecutionPort; E2E em Docker macOS e Linux | ainda não prova Windows                   |
| Provider      | replay DeepSeek case-local   | aceito como representativo                                                | a semântica de Hook é independente do provider |

Podas:

- Não fazer o produto cartesiano dos 7 eventos com todos os nomes de tool, modos, providers, temas e locales.
- O E2E usa um recorder em Node: `process` cobre os 7 eventos, e `command` síncrono/assíncrono representa respectivamente o caminho de shell e o de
  fire-and-forget; não expandir para combinações repetidas de 7 eventos x 3 modos de execução.
- `PreToolUse` e `PermissionRequest` usam uma tool de sucesso que exige aprovação; `PostToolUseFailure` usa uma tool que falha de forma determinística.
- A exibição de plugin e a importação legacy são provadas por testes focados da página de configurações/service; o E2E de lifecycle do conjunto foca no fechamento do runtime.
- O Web no celular reutiliza a mesma HooksSection e o mesmo Agent runtime, sem novo runtime independente e sem alterar a
  fronteira `desktop-continuous` / `web-remote-replayable`.

## Accepted Cases

| Case ID  | Setup                                                                                           | Ação                        | Asserções                                                                                                | Evidência                                                      | Status   |
| -------- | ----------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| HK-01    | hook de processo em SessionStart                                                               | criar nova session e enviar a primeira mensagem | o hook roda só uma vez; source/stdin/context corretos                       | `hooks-seven-events.test.ts`, `runtime-hooks.test.ts`        | coberto  |
| HK-02    | hook de processo em UserPromptSubmit                                                           | enviar prompt                    | campo de prompt correto; block/context têm efeito                        | `hooks-seven-events.test.ts`, `runtime-hooks.test.ts`        | coberto  |
| HK-03    | hook de processo em PreToolUse                                                                  | o modelo chama uma tool        | matcher, updatedInput/deny/context têm efeito; deny com retorno antecipado ainda preserva context       | `hooks-seven-events.test.ts`, `tool-executor-trace.test.ts`  | coberto  |
| HK-04    | hook de processo em PermissionRequest                                                           | tool que pede permissão        | allow/deny/modify do hook substituem o broker                            | `hooks-seven-events.test.ts`, `tool-executor-trace.test.ts`  | coberto  |
| HK-05    | hook de processo em PostToolUse                                                                 | tool com sucesso               | `tool_response` é a saída completa; o context entra na próxima requisição | `hooks-seven-events.test.ts`, `tool-executor-trace.test.ts`  | coberto  |
| HK-06    | hook de processo em PostToolUseFailure                                                          | a tool lança erro              | string error/is_interrupt; o recovery context tem efeito                  | `hooks-seven-events.test.ts`                                 | coberto  |
| HK-07    | hook de processo em Stop                                                                        | a resposta final do assistente está prestes a terminar | transcript/last message corretos; block pode continuar, no máximo 3 vezes seguidas | `hooks-seven-events.test.ts`, `runtime-hooks.test.ts`        | coberto  |
| HK-LC-01 | isolar na config do usuário 7 eventos de processo, adicionando command síncrono/assíncrono; provider fixa cadeia de modificação, aprovação, sucesso e falha | enviar pela UI e esperar o marker final | 7 eventos, três modos de execução, stdin compatível, modificação de entrada em dois níveis (Pre/Permission), allow, context de sucesso/falha e idle final | UI do desktop + arquivo de runtime + requests de replay isolated/default | coberto |
| HK-EF-01 | PreToolUse nega em sequência pela entrada, devolve updatedInput inválido e exige PermissionRequest deny | provider aciona três Write em sequência | nenhum handler executou; cada resultado de falha antecipada preserva o additionalContext correspondente; PermissionRequest só dispara no caminho ask | arquivo de runtime do desktop + resultados de tool visíveis ao provider | coberto |
| HK-ST-01 | Stop bloqueia sempre; a fixture fornece apenas a resposta inicial e as três respostas de continuação | enviar o marker de cap do Stop | o Stop executa 4 vezes mas continua só 3; o 4º context não entra em nova requisição; resposta final e idle corretos | contagem de requests + trace + UI do desktop | coberto |
| HK-UP-01 | no mesmo UserPromptSubmit, configurar um process block síncrono e um command block assíncrono | enviar o prompt com marker de bloqueio | o block síncrono encerra antes do modelo; o command assíncrono inicia/termina, mas sua saída não muda a fronteira atual | zero requisição principal + trace + UI do desktop | coberto |

Fronteiras de regressão complementares:

- `command async:true` precisa retornar imediatamente, ignorar decisões de background e, quando o chamador cancela, encerrar a execução registrando
  `outcome: "cancelled"`.
- `PermissionRequest` valida deny e allow + mapeamento de `updatedInput`/`updatedPermissions` separadamente.
- Com o plugin explicitamente desligado, os hooks de runtime ficam vazios; os detalhes do plugin continuam em `plugins/list`, para exibição somente leitura do estado desligado na página de configurações.

## Full-chain Hooks Suite

Spec oficial:

`packages/desktop/test/e2e/conversation-session/conversation-session-hooks-lifecycle.test.ts`

Artefatos case-local:

- Provider fixture:
  `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-hooks-lifecycle.json`
- Manifest:
  `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-hooks-lifecycle.json`
- File fixture: o WDIO escreve hooks no `~/.zcode/cli/config.json` do usuário no HOME isolado; a spec escreve recorder/trace no workspace padrão,
  restaurando o config do usuário e removendo os artefatos do workspace ao final.
- Timing: `fast-text`. A execução dos Hooks e as asserções de arquivo não dependem da cadência do SSE.

Setup/action/assert desta suite:

1. Setup: os 7 eventos apontam para o mesmo recorder de `process`; SessionStart/UserPromptSubmit recebem também `command` síncrono e
   assíncrono. O recorder acrescenta ao trace o stdin compatível, o executor, a phase e o conteúdo legível do transcript.
2. Action: rodar sequencialmente quatro novas sessions de full-chain, early-failure, Stop cap e prompt block.
3. Assert:
   - A navegação de Hooks nas configurações é acessível e os 7 eventos configurados são renderizados como linhas de configuração.
   - Todos os 7 eventos existem no trace de process; SessionStart/UserPromptSubmit/Stop aparecem uma vez cada.
   - A cadeia de sucesso Pre/Permission/Post compartilha o mesmo uso de tool; a entrada final após as duas modificações entra no handler,
     e o PostToolUse tem o `tool_response` completo.
   - A cadeia de falha produz PostToolUseFailure, o error é string e o recovery context entra na próxima requisição.
   - Pre deny, updatedInput inválido e Permission deny preservam context nos três pontos de saída de falha antes do handler.
   - O Stop continua no máximo três vezes seguidas; a 4ª vez o Hook ainda executa, mas não dispara um 5º provider request.
   - O command síncrono realmente passa pelo shell; a saída do command assíncrono não muda o evento que já prosseguiu.
   - Ao final, a UI de cada case volta a idle; os cases que precisam de modelo mostram o marker final.

## Lifecycle Decision

- `manual-review/pending`: não usado. Os 7 eventos e seus efeitos foram explicitamente confirmados pelo usuário, e o case formal de replay determinístico é escrito direto.
- `e2e:promote`: não usado; o case não é uma live probe aguardando julgamento humano.
- `e2e:fixture:check`: obrigatório.
- replay case-local isolado: obrigatório, para provar que não há dependência do provider fixture compartilhado legacy.
- replay default: obrigatório.
- Docker: primeiro a prova de replay-isolated de spec única; só depois de passar é possível usar `e2e:docker:admit` para entrar no
  conversation preset.
- Portões finais: `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint`.

## Verification Record

2026-07-13, suite full-chain:

- `e2e:fixture:check`: passou, com 15 entradas no fixture case-local.
- replay case-local isolado: 4 cases / 4 passing; artifact
  `desktop-e2e-20260713-110936-723`.
- replay default: 4 cases / 4 passing; artifact `desktop-e2e-20260713-111026-804`.
- replay-isolated de spec única em Docker: 4 cases / 4 passing em contêiner Linux/amd64 sem rede; artifact
  `desktop-e2e-20260713-111159-34015`.
- core focado: 3 files / 64 tests, cobrindo o contrato dos sete eventos, o limite de Stop no runtime, o trace de execução de tool,
  Permission/updatedInput/context de falha antecipada.
- settings/service: 2 files / 10 tests, cobrindo salvamento, habilitação/desativação, workspace identity, importação compatível, exibição agrupada de plugin
  e o ida e volta de command async/shell.
- Portões estáticos: `typecheck:e2e`, `pnpm typecheck` da raiz e `pnpm lint` passaram; lint com 0 error.

A seguir está a baseline histórica anterior à extensão da suite full-chain, que não serve como evidência de conclusão de HK-EF-01, HK-ST-01 e HK-UP-01;
cases novos precisam receber um registro de replay próprio depois da implementação.

- `e2e:fixture:check`: passou.
- replay case-local isolado: passou, 1 case / 1 assertion group; artifact
  `desktop-e2e-20260710-061853-992`.
- replay default: passou, com o manifest resolvendo automaticamente common + case-local fixture; artifact
  `desktop-e2e-20260710-061945-862`.
- replay-isolated de spec única em Docker: passou, 1 case / 1 passing em contêiner Linux/amd64 sem rede; artifact
  `desktop-e2e-20260710-062035-75778`.
- core focado: 4 files / 62 tests, cobrindo o contrato parametrizado dos 7 eventos, matcher, desativação, stdout de diagnóstico, cancelamento de async,
  deny/modify de PermissionRequest, deny context de PreToolUse e o limite de continuações seguidas do Stop.
- settings/service: 4 files / 23 tests, cobrindo toggle persistido, fidelidade da origem, edição de `statusMessage`,
  importação legacy e exibição somente leitura de plugin.
- As três execuções do WDIO apresentaram, no teardown do Electron após os testes, um warning de ContextId já destruído; o código de saída continuou sendo 0,
  as asserções de lifecycle do Hook já estavam todas concluídas e esse warning foi registrado como problema de limpeza do harness de E2E, não como falha de Hook.