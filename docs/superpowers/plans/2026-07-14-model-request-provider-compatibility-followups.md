# Actions de follow-up de compatibilidade de provider para requisições de modelo

> Estado: as diferenças foram auditadas e não entram nesta rodada de correção mínima de
> token de saída. Este documento não modifica Compact, a prioridade de expansão de
> `extra_body`, o estado de resposta vazia nem a UI.

## Responsabilidades atuais do protocolo

| Protocolo de requisição | Implementação atual | Responsabilidade pela serialização de campos |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| OpenAI Compatible Chat | já integrado | o AI SDK mapeia `maxOutputTokens` para `max_tokens` |
| OpenAI Responses       | já integrado | o AI SDK mapeia `maxOutputTokens` para `max_output_tokens` |
| Anthropic Messages     | já integrado | o AI SDK mapeia `max_tokens` e soma o fixed thinking budget ao valor final |
| Gemini                 | SDK/provider kind correspondente não integrado | não pode ser considerado suportado pelo caminho atual do AI SDK |
| Bedrock                | SDK/provider kind correspondente não integrado | não pode ser considerado suportado pelo caminho atual do AI SDK |

O ZCode responde pelo orçamento de capacidades do modelo, pela omissão condicional por
provider e pela renomeação de campos provider-specific no JSON body final; o AI SDK
responde apenas pela serialização dos campos padrão dos protocolos já integrados, não
pela política de provider/model do ZCode.

## Action 1: unificar a fronteira de deep merge de providerOptions

Existem hoje quatro comportamentos de merge diferentes:

1. As provider options do workspace e as model options usam merge raso de nível superior;
   a namespace de mesmo nome do model sobrescreve por completo a namespace do provider.
2. As model target options e as thought-level options usam merge profundo recursivo.
3. Vários registry targets do mesmo provider acusam conflito de configuração se as
   `providerOptions` não forem exatamente iguais.
4. O adapter runner faz merge raso de nível superior entre as provider options resolvidas
   e as request provider options; depois disso, só faz merge recursivo parcial na
   namespace de SDK do OpenAI Compatible.

Os campos afetados incluem:

- `anthropic.thinking`, `anthropic.effort`, options de cache/beta;
- `openai.reasoningEffort`, `reasoningSummary`, `store`, cache key;
- `openaiCompatible.extra_body`, `thinking`, `chat_template_kwargs`;
- namespace de gateway routing/caching;
- as futuras namespaces de provider Gemini e Bedrock.

A diferença típica é: no base, `{ anthropic: { custom: true, thinking: {...} } }` e a
sobrescrita da requisição `{ anthropic: { effort: "high" } }`; após o merge, o runner atual
perde `custom` e `thinking`.

A implementação futura deve primeiro definir uma prioridade única e depois aplicar a
função de merge recursivo compartilhada a provider→model→runtime request; arrays e
escalares continuam sendo sobrescritos por completo pelo último. `extra_body` participa
apenas da mesclagem de objetos comuns, sem alterar sua expansão atual nem a prioridade de
campos de mesmo nome.

## Action 2: completar a matriz de parâmetros de requisição padrão de provider/model

Hoje o turno principal define explicitamente apenas o orçamento de saída do modelo e as
providerOptions de reasoning; `temperature`, `topP`, `topK`, penalty, stop e seed existem
no contrato geral de requisição, mas, quando não definidos no turno principal, ficam por
conta dos padrões do SDK/provider.

É preciso avaliar item a item em vez de ligar tudo de uma vez:

- `store`, reasoning summary e encrypted reasoning continuation em
  Responses/OpenAI-compatible;
- session/prompt cache key;
- options de usage e caching em OpenRouter/Gateway;
- padrões de reasoning/thinking em Gemini, Anthropic-compatible, Alibaba etc.;
- padrões de temperature/topP/topK em modelos Qwen, Gemini, MiniMax, Kimi etc.;
- headers obrigatórios do provider e interruptores de tool streaming.

Cada valor padrão deve ser condicionado à capability de provider/model e comprovado por
teste sobre o request body final; providers desconhecidos permanecem sem injeção, evitando
enviar a extensão de um provider para todos os endpoints compatíveis.

## Action 3: ampliar a matriz de compatibilidade de message/tool

Já existem hoje: projeção de capability de mídia, substituição de mídia vazia, Anthropic
cache control, replay de reasoning DeepSeek, metadata de thinking Anthropic, limpeza de
reasoning item stateless em Responses, desativação de tool eager input no Anthropic e
projeção de structured tool result.

Ainda não cobertos de forma unificada:

- limpeza de surrogate Unicode inválido;
- filtragem de mensagens vazias e content parts vazios em Anthropic/Bedrock;
- requisitos de conjunto de caracteres/comprimento de tool call id em Claude e Mistral;
- correção da sequência de mensagens tool→user no Mistral;
- degradação de tool JSON Schema em OpenAI, Moonshot e Gemini;
- remapeamento da namespace de providerOptions em message/content part;
- tool no-op provider-specific e tool-call repair.

Isso deve ser adicionado item a item conforme as falhas reais de cada provider, sem criar
adivinhação automática nem retry de falha para providers desconhecidos. Cada item deve
conter pelo menos um teste de transform puro e um teste do request body final visível ao
provider.

## Action 4: adicionar providers de protocolo de primeira classe

Gemini, Bedrock, Azure, Vertex etc. não podem ser declarados como plenamente suportados
apenas pelo caminho OpenAI Compatible atual. A integração precisa fornecer simultaneamente:

- provider factory, autenticação e escolha de endpoint;
- projeção da namespace de providerOptions;
- opções de reasoning/padrão;
- compatibilidade de schema de message/tool;
- testes do request body final e da resposta em streaming.

A prioridade deve ser definida pela demanda real dos usuários por provider, e não pelo
fato de existir um registro de modelo no catálogo.