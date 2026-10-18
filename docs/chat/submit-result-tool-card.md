# Cartão de ferramenta submit_result (「已提交结果」)

## Status de publicação

Design finalizado, implementado nos commits após este spec. Fatos prévios:

- o painel lateral do lado do actor **não** é um renderizador de transcrição independente — o `WorkflowActorSessionSidePane` monta um `SessionPane` somente leitura aninhado
  (`packages/ui/src/app-shell/WorkflowActorSessionSidePane.tsx:86-101`, cujo comentário de arquivo
  diz explicitamente que fluxo ao vivo / recuperação a frio / revisão passam todos pela cadeia de SessionPane já existente), portanto `submit_result` chega como uma linha
  `toolCall` comum de v4 e é renderizada pelo mesmo registry de ToolCallBlocks da sessão principal;
- `submit_result` não está na tabela de ferramentas conhecidas da UI (`ZCODE_KNOWN_TOOL_NAMES` em
  `packages/shared/src/tool-identity.ts` termina em `CreateWorkflow`) → family `"unknown"` →
  `FallbackToolCallBlock`: ícone de chave de fenda, rótulo em capitalize "Submit_result" e um `<pre>` cru com o
  `JSON.stringify(…, null, 2)` do **objeto toolCall inteiro** (`renderers/fallback.tsx:63-67`, que ainda usa o
  `text-ui-xs` fora do token);
- toda a carga útil está do lado da **entrada**: o schema de saída da ferramenta tem apenas `{status: "accepted"}`
  (`apps/zcode-cli/packages/contracts/src/tools/submit-result.ts:29-33`) e a entrada é a chave única
  `{result: <unknown>}` — o JSON Schema concreto de cada ask vem em nota de rodapé das instruções, e não da declaração da ferramenta (declaração congelada para
  preservar o prompt cache).

(Decisão do usuário em 2026-09-01) O cartão no estado de rejeição passa a ser uma linha plana não expansível — o painel de violações campo a campo foi removido por completo (junto com
`parseSubmitResultViolations` e a entrada `violationsHeading`), e o texto original da rejeição permanece acessível via `statusTooltip` do estado de falha
(copável em hover); o comportamento de expansão dos estados aceito/parado permanece inalterado.

## Feature Summary

| Field | Value |
| --- | --- |
| Change | O registry ToolCallBlocks registra um renderizador dedicado para `submit_result`: rótulo 「已提交结果」（escalonado por fase），body com renderização inteligente de `input.result`（string → prose no corpo；objeto/array → JSON CodeBlock com destaque de sintaxe），dobrado por padrão e expansível；no estado de rejeição é uma linha plana não expansível（o texto da rejeição vai para o tooltip do estado de falha, conforme a decisão de 2026-09-01 em Status de publicação） |
| User-visible surfaces | Cartão de ferramenta（actor side pane e sessão principal compartilham o mesmo registry — corrigir um lado resolve os dois）。Nenhum novo display kind, nenhuma mudança de protocolo, nenhuma mudança no CLI |
| Existing behavior | renderização fallback: "Submit_result" + dump de JSON cru do toolCall inteiro |
| State owner | Nenhum estado novo. Projeção somente de leitura: `toolCall.input.result` lido diretamente (mesmo precedente de `RespondToCoordinator` lendo `input.summary` diretamente) |
| Out of scope | novo membro do display union；mudanças no CLI/motor；renderização em nível de campo ciente do schema por ask；teste genérico de paridade de keys zh/en |

## Clarification Log

| Round | Question | User answer | Boundary fixed |
| --- | --- | --- | --- |
| 1 | como renderizar o objeto submetido no body | **roteamento inteligente**: string → prose, objeto → JSON CodeBlock | roteia por tipo após normalização；ambos os caminhos têm idioms existentes (a argumentação de prose do texto de erro de run / o bloco CodeBlock de `mcp.tsx`) |
| 1 | expandido ou dobrado por padrão | **dobrado por padrão**, expansível | mesma regra das demais ferramentas；o cabeçalho dobrado mostra uma linha de resumo do result |
| 1 | o que exibir na rejeição (retry por violação de schema) | **rótulo de rejeição + linha de violação** | o formato de texto de violação do handler é estável (`<path>: expected …, got …`) e o loop de retry fica legível na transcrição |

## Boundary Decisions

| Boundary | Decision | Includes | Excludes / prunes | Source |
| --- | --- | --- | --- | --- |
| Registro de rota | `packages/shared/src/tool-identity.ts`: `ZCODE_KNOWN_TOOL_NAMES` ganha o **literal** `"submit_result"`, `TOOL_FAMILY_BY_NAME` mapeia para a family `"workflow"` (o Record é total e o TS força o pareamento); dentro do case `workflow` de `resolveRenderer.ts` o novo renderizador é despachado por `identity.toolName` | a comparação case-insensitive já existe (`normalizeZCodeToolName` passa pela tabela em minúsculas), mas o sublinhado precisa estar presente literalmente — o nome no wire é `submit_result`, a única ferramenta snake_case do repositório | não criar nova family (mesmo precedente da family `message` para `RespondToCoordinator`: despachar por nome dentro da family); sem renomear no lado do CLI | precedente de `RespondToCoordinator` (`resolveRenderer.ts:74-76`) |
| Fonte de dados | o renderizador lê `toolCall.input.result` diretamente; a saída no estado aceito é sempre "The result was accepted.", sem informação, e não é lida | `input`, via `toolCallRowAdapter.ts:38-55`, já é um objeto parseado；o primeiro frame de streaming pode ser `{}` ou parcial (`inputPreviewComplete: false`) | **sem** novo membro do display union — isso exigiria contrato + v4 + parser da UI + producer travados em passo (`toolDisplay.ts:125-128` registra o risco de degradação silenciosa se um lugar for esquecido), e a carga útil já está toda do lado da entrada | conclusão convergente do scout |
| Normalização do result | string passa por uma única tentativa de `JSON.parse` tolerante; se resultar em objeto/array usa o valor parseado; se o parse falhar ou já for string → trata como prose | este é o **espelho de leitura** de uma conclusão real do motor: `engine/scheduler.ts:252-278` registra que "modelos reais frequentemente serializam `result` como string JSON" e faz o mesmo parse tolerante único；no lado da UI, `toRecord` (`respond-to-coordinator.tsx:13-29`) usa o mesmo idiom | normalização somente na leitura, jamais reescrevendo dados；sem parse recursivo em várias camadas (o motor também faz só uma vez) | `scheduler.ts:252-278` + precedente de `toRecord` |
| Renderização do body (branch prose) | após normalização ser string → renderização em estilo de corpo (pre-wrap, tokens semânticos, **não mono**) | fala humana é prose — `WorkflowRunSidePane.tsx:329-336` aplica ao texto de erro de run a mesma argumentação do DESIGN.md (mono fica para caminhos/comandos/código/identificadores/dados de terminal) | sem renderização markdown (a string de result não tem contrato markdown; renderizar como texto rico seria um palpite sem base) | DESIGN.md + precedente do texto de erro de run |
| Renderização do body (branch JSON) | objeto/array/qualquer outro não-string → `JSON.stringify(…, null, 2)` dentro de `CodeBlock language="json"`, com o idiom de container de `mcp.tsx:283-294` (`max-h` com scroll + `rounded-xl border border-border bg-card`) | o CodeBlock respeita a preferência de tamanho de fonte de código do usuário (DESIGN.md:189/220)；de quebra corrige o `text-ui-xs` fora do token do fallback (DESIGN.md:203 reserva xs para badges/contadores) | não montar `<pre>` à mão (isso contornaria a configuração de tamanho de fonte de código) | idiom de `mcp.tsx` + DESIGN.md |
| Dobra e gate de streaming | dobrado por padrão (`canToggle`)；**gate `hasDetails`**: a expansão/`renderContent` só é oferecida quando a chave `result` está presente no `input` (idiom literal em `send-message.tsx:112,192-193,206`)；cabeçalho dobrado com um resumo de uma linha truncado (compressão em linha única do result normalizado) | `ToolSnapshotFieldNotice` é preservado (combo fixo de todo renderizador não-fallback com o ToolLayout, `send-message.tsx:208-215`) | não dar ao primeiro frame vazio uma entrada de expansão para um painel vazio；não usar `summaryAction` (ele curto-circuitaria todo o body, `ToolLayout.tsx:101/109/286`) | precedente de `send-message.tsx` |
| Rótulo por fase | novo bloco i18n `chat.toolCall.submitResult.*`, com as duas locales imediatamente ao lado do bloco `respondToCoordinator`: completed → `submitted` 「已提交结果」/ "Result submitted"；pending/in_progress → `submitting` 「正在提交结果」/ "Submitting result"；failed → `rejected` 「提交被驳回」/ "Submission rejected"；stopped → `stopped` 「提交已停止」/ "Submission stopped" | key ausente renderiza a key crua de forma silenciosa (`IntlProvider.tsx:109` `messages[id] ?? id`) → as duas locales **precisam** ser entregues no mesmo commit | não reaproveitar as keys de respondToCoordinator (semântica diferente: lá é "resposta", aqui é "resultado submetido") | fato do mecanismo de i18n |
| Body no estado de rejeição | (decisão do usuário em 2026-09-01) quando `failed`, o cartão é uma linha plana não expansível: sem entrada de toggle e sem body expandido. O texto original da rejeição permanece acessível pelo `statusTooltip` do estado de falha (copável em hover) | rótulo de fase 「提交被驳回」 + rótulo e tooltip de estado de falha | remoção completa do painel de violações campo a campo (`parseSubmitResultViolations` e a entrada `violationsHeading` são deletadas)；sem repetir o schema na UI | decisão do usuário + idiom do tooltip de falha |
| Posse dos testes | novo `submitResultToolCallBlock.test.tsx` em `packages/ui/test/` (renderização dos vários estados) + extensão das asserções de tool-identity em `packages/shared` | nenhum fixture de e2e existente contém linha de submit_result (varredura exaustiva do scout) — o teste unitário pode fabricar seu próprio toolCall, e e2e está fora deste ciclo | — | fato negativo verificado pelo scout |

## Fluxo de dados

```
sessão do actor (sessão persistente real)
  → linha toolCall do v4 {toolName: "submit_result", input: {result: <JSON | JSON-string>}, output: {text: "The result was accepted." | texto de violação}}
  → toolCallRowAdapter (input repassado como está; frames de streaming reconstruídos via preview, inputPreviewComplete=false)
  → resolveToolCallIdentity: ZCODE_KNOWN_TOOL_NAMES casa "submit_result" → family "workflow"
  → resolveRenderer: case workflow despacha por toolName → SubmitResultToolCallBlock
      rótulo: fase → chat.toolCall.submitResult.{submitting|submitted|rejected|stopped}
      body (após o gate hasDetails, dobrado por padrão):
        normalize(input.result): string e parseável como objeto/array → valor parseado
        ├─ string → corpo em prose (pre-wrap, não mono)
        └─ objeto/array/outro → CodeBlock language="json" (idiom de container de mcp.tsx)
      branch failed: o cartão é uma linha plana não expansível; o texto original da rejeição fica acessível pelo statusTooltip do estado de falha (sem body expandido)
```

## Invariants

- Projeção puramente de UI: não escreve estado, não muda CLI/protocolo/display union; corrigir um lugar (o registry) faz os dois lados (sessão principal +
  actor side pane) valerem ao mesmo tempo.
- A normalização acontece apenas na leitura: `JSON.parse` no máximo uma vez (a mesma tolerância do motor), e a falha significa tratar como string, nunca lançar erro e
  quebrar o cartão.
- Frames de streaming vazios/parciais nunca oferecem entrada de expansão para um painel vazio (gate `hasDetails`).
- `chat.toolCall.submitResult.*` das duas locales chega no mesmo commit — key ausente renderizada crua é degradação silenciosa.
- Mono é só para dados (branch JSON); fala humana (branch prose, rótulo antes das linhas de violação) usa tokens de corpo.

## Tests

| Case | 位置 |
| --- | --- |
| Roteamento: `submit_result` cai na family `workflow`；resolveRenderer despacha para o novo renderizador；`CreateWorkflow` continua sendo despachado para o renderizador original (despacho dentro da family não acerta em quem não deve) | asserções de tool-identity em `packages/shared` + `packages/ui/test/` (seguindo o padrão de teste existente de resolveRenderer) |
| completed + result objeto → rótulo 「已提交结果」 + JSON CodeBlock após expandir | `packages/ui/test/submitResultToolCallBlock.test.tsx` (novo) |
| completed + result só string → corpo em prose (sem CodeBlock) | idem |
| completed + result string JSON (`"{\"a\":1}"`) → desembrulhado em objeto e segue o branch CodeBlock | idem |
| frame de streaming vazio (`input` sem a chave `result`) → sem entrada de expansão e sem painel vazio | idem |
| failed → rótulo 「提交被驳回」 + linha plana não expansível (sem toggle, sem body)；o texto da rejeição vai para o statusTooltip do estado de falha | idem |
| stopped → 「提交已停止」 | idem |
| keys das duas locales presentes (`submitting`/`submitted`/`rejected`/`stopped` × zh/en) | idem (ou em um teste de asserção de i18n) |

## Follow-ups（registrados, fora do escopo desta feature）

| Item | Por que não agora |
| --- | --- |
| renderização em nível de campo ciente do schema por ask (cartão key-value) | o JSON Schema do ask só vive na nota de rodapé das instruções e é inacessível à UI; para levá-lo à UI seria preciso mexer no protocolo |
| teste genérico de paridade de keys zh/en | a ausência desse teste no repositório é um fato já existente (confirmado pelo scout) e cobri-lo é uma rodada de infraestrutura à parte |
| fixture de e2e com linha de submit_result | o teste unitário desta fase, com seu próprio toolCall, é suficiente；o cenário de e2e deve ser desenhado junto com o esqueleto de e2e de workflow |