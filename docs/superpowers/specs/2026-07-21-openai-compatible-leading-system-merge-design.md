# Design de mesclagem da mensagem system inicial em provedores OpenAI-compatible

## Feature/change summary

| Field | Value |
| --- | --- |
| Change | Antes de enviar a requisição OpenAI-compatible, mesclar as várias mensagens system iniciais consecutivas em uma |
| User-visible surfaces | Nenhuma mudança direta de UI; chat templates legados deixam de falhar por várias mensagens system iniciais ou de manter apenas a última |
| Existing code owners | `apps/zcode-cli/packages/adapters/src/model/transform.ts`, `system-message-compat.ts` |
| Evidence | Testes unitários do adapter e corpo wire real com `@ai-sdk/openai-compatible` via fake-fetch |
| Out of scope | Anthropic, OpenAI Responses, gateway/custom provider, core ContextBuilder, semântica de system no meio da sessão |

## Contexto e causa raiz

O Core ContextBuilder gera de propósito três blocos de mensagens system para diferentes níveis de
estabilidade e limites de cache: CLI prefix, stable body e dynamic body. O conversor de Chat Completions
OpenAI-compatible do AI SDK envia essas mensagens uma a uma e não as mescla em nome do chamador.

OpenAI-compatible restringe apenas a forma externa HTTP, não o chat template do modelo no backend. Alguns
templates legados aceitam somente um system inicial; outros sobrescrevem valores antigos ao percorrer
várias mensagens system. Portanto, os vários blocos de system devem permanecer no core neutro de
provider, mas precisam ser normalizados na fronteira de serialização do adapter OpenAI-compatible.

## Clarification log

| Round | Question | User answer | Boundary fixed | Follow-up needed |
| --- | --- | --- | --- | --- |
| 1 | É possível mesclar vários system antes de enviar no OpenAI-compatible | O usuário confirmou e exigiu a implementação | É uma correção de compatibilidade e não altera a montagem de prompts do core | no |
| 1 | Promover também o system do meio da sessão para o início | Aceitou a conclusão da pesquisa: mesclar apenas os system iniciais consecutivos | Proibido alterar a posição causal do system | no |
| 2 | Rejeitar o system que aparece depois do prefixo inicial | O usuário confirmou que essa validação é um fallback excessivo e exigiu sua remoção | O adapter mescla apenas o prefixo inicial e repassa o system do meio como está | no |

## Contrato da requisição

Executa-se apenas quando `providerKind === "openai-compatible"`:

1. A partir do índice 0 das mensagens, identificar o prefixo system contínuo.
2. Quando houver duas ou mais mensagens system no prefixo, juntar os textos na ordem original usando o
   separador exato `\n\n`, sem trim, sem ordenação e sem perda de espaços em branco.
3. O resultado da mesclagem ocupa a posição da primeira system original; o conteúdo e a ordem das demais
   mensagens user, assistant e tool permanecem inalterados.
4. Zero ou uma system inicial não cria nenhuma transformação adicional.
5. Se uma system reaparecer após o fim do prefixo inicial, mantenha sua posição e conteúdo originais; o
   adapter não é responsável por elevar, rebaixar, reescrever ou rejeitar system do meio.
6. Anthropic, OpenAI, gateway e custom provider continuam preservando os vários blocos de system.
7. O Core ContextBuilder continua preservando os vários blocos de system, evitando quebrar o limite de
   cache da Anthropic.

```text
provider-neutral core          adapter                         HTTP wire
system(prefix)  ┐
system(stable)  ├─ openai-compatible ─> system(prefix\n\nstable\n\ndynamic)
system(dynamic) ┘                                  │
user / assistant / tool ───────────────────────────┴─> 原顺序不变

非 OpenAI-compatible ─────────────────────────────────> 全部原样保留
user ... system(mid-conversation) ─────────────────────> 原位置透传，不 hoist
```

## Domain scope and high-risk cross-products

| Domain | Include? | Decision |
| --- | --- | --- |
| Model/provider/runtime config | yes | `providerKind` é o único botão de ativação e a transformação pertence ao adapter |
| Conversation/session behavior | limited | Apenas protege a ordem das mensagens; não modifica session/history/persistence |
| Mobile remote/replayable | no | Desktop e mobile acabam compartilhando o agent adapter; a semântica de entrega não muda |
| Workspace identity | no | Não lê campos relacionados a workspace |
| Protocol/schema | no | `ModelInputMessage` e `@zcode/protocol` não mudam |

O único item cruzado de alto risco é provider kind × posição do system × quantidade de systems. Cliente,
workspace e stream/generate são todos colapsados pela mesma função de normalização do adapter, sem se
expandirem para estados de produto independentes.

## Candidate combinations and pruning

| Candidate ID | Provider | Input shape | Expected effect | Status |
| --- | --- | --- | --- | --- |
| OCS-01 | OpenAI-compatible | 0 systems | Transformação como está | accepted |
| OCS-02 | OpenAI-compatible | 1 system inicial | Transformação como está | accepted |
| OCS-03 | OpenAI-compatible | 2+ systems iniciais | Mesclar em uma, com ordem e texto inalterados | accepted |
| OCS-04 | OpenAI-compatible | system após user | Manter posição e conteúdo originais, sem hoist | accepted |
| OCS-05 | Anthropic/OpenAI/gateway/custom | 2+ systems iniciais | Não mesclar | accepted |
| OCS-06 | generate/stream | Mesma entrada de mensagens | Mesmo resultado por compartilhar `toAiSdkMessages` | accepted |

As seguintes combinações são podadas: desktop/mobile, local/remote, continuous/replayable e workspace
identity. Todas decidem o transporte ou a atribuição de runtime antes de a requisição entrar no adapter e
não alteram a entrada puramente de message/providerKind deste design.

## Accepted cases

| Case ID | Setup | Action | Assertions | Evidence layers | E2E status |
| --- | --- | --- | --- | --- | --- |
| OCS-01/02 | OpenAI-compatible, 0/1 system | Chamar o message transform | Quantidade e conteúdo inalterados | unit | adapter unit |
| OCS-03 | Três systems iniciais + histórico comum | Chamar transform e o generate real do SDK | O wire contém apenas uma system e os roles/order seguintes ficam inalterados | unit + network body | adapter wire |
| OCS-04 | Inserir system após user | Chamar transform | Mantém posição e conteúdo originais, e o prefixo inicial ainda é mesclado normalmente | unit | adapter unit |
| OCS-05 | Duas systems iniciais na Anthropic | Chamar transform | Continua sendo duas systems | unit | adapter unit |

Não se adiciona catálogo/matriz E2E de conversation-session: essa correção não introduz estados de
interação do usuário, e o teste wire com o SDK real já cobre diretamente a superfície final de aceitação;
o E2E de desktop apenas repetiria o contrato de requisição do adapter.

## Limites de implementação

- Fornecer uma função pura dedicada em `system-message-compat.ts`, chamada antes da conversão por papel em
  `toAiSdkMessages()`.
- Não modificar `buildProviderRequestMessages()`, mantendo a projeção core/provider neutra.
- Não analisar e reescrever corpos desconhecidos no wrapper final de fetch JSON; a fronteira de mensagens
  tipadas preserva as restrições de papel e ordem.
- A system mesclada herda o marcador de cache-control da última system inicial. Esse marcador é projetado
  apenas nas provider options da Anthropic e não afeta o wire OpenAI-compatible; mantê-lo evita deriva
  desnecessária em estados intermediários do adapter.

## Verificação

- `model-transform.test.ts`: OCS-01 a OCS-05.
- `openai-compatible-system-messages-wire.test.ts`: fake fetch do SDK real, assertando o `messages` final.
- `pnpm --filter @zcode/adapters typecheck`.
- `pnpm typecheck` e `pnpm lint` na raiz.