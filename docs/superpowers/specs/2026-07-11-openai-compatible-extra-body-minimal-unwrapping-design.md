# Campos canônicos de requisição de reasoning para OpenAI-compatible

## Status

Implemented

## Contexto e causa raiz

A política de reasoning do ZCode e o catálogo de modelos embutido chegaram a armazenar os parâmetros de extensão do OpenAI-compatible em
`openaiCompatible.extra_body`. O runner então expandia o wrapper e o entregava ao
`@ai-sdk/openai-compatible`. Isso fazia o mesmo parâmetro ter duas expressões entre “configuração do modelo” e “requisição final”, e tratava
o argumento de chamada `extra_body` do client Python/OpenAI como se fosse um campo de protocolo do provider.

O contrato real do provider e do AI SDK são opções diretas canônicas:

- `reasoningEffort` -> wire `reasoning_effort`
- `thinking` -> wire `thinking`
- `enable_thinking` -> wire `enable_thinking`

O mapeamento antigo do GLM-5.2 também colocava `reasoning_effort` dentro de `chat_template_kwargs`, o que fazia gateways OpenAI-compatible que suportam `reasoning_effort` no nível superior rejeitarem a requisição.

Esta rodada apenas corrige os parâmetros de requisição de modelo gerados automaticamente pelo ZCode; não altera o reconhecimento de modelo, o conjunto de níveis de pensamento, o nível padrão, a UI, o protocolo ou a escolha de conexão do provider.

## Contrato da requisição

```text
model/catalog reasoning profile
          │ canonical AI SDK options
          ▼
providerOptions.openaiCompatible
          │ copy to resolved provider-name namespace
          ▼
@ai-sdk/openai-compatible
          │ serialize once
          ▼
provider wire body (no ZCode-generated extra_body)
```

Os parâmetros OpenAI-compatible gerados automaticamente pelo ZCode são fixos:

| Contrato do modelo               | Nível                     | canonical option                                    | wire final                                            |
| ------------------------------- | ------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| GLM-5.2                         | `max` / `high` / `nothink` | `reasoningEffort=max/high/none`                     | `reasoning_effort=max/high/none`                     |
| Inferência automática DeepSeek V4 | `high/max`                | `thinking.type=enabled` + `reasoningEffort=<level>` | `thinking.type=enabled` + `reasoning_effort=<level>` |
| Qwen thinking toggle            | `enabled/off`             | `enable_thinking=true/false`                        | `enable_thinking=true/false`                         |
| Kimi/MiMo e afins thinking toggle | `enabled/off`             | `thinking.type=enabled/disabled`                    | `thinking.type=enabled/disabled`                     |

A chave de UI `nothink` do GLM-5.2 permanece inalterada e só é mapeada para `none` na fronteira das provider options; não são adicionados aliases nem níveis de UI.

O catálogo embutido e preciso do DeepSeek V4 pode exibir `off/high/max`; a tabela acima só descreve a inferência automática quando não há catálogo preciso.
`low/medium` servem apenas para normalizar valores antigos de configuração para `high` e não são níveis canônicos exibíveis.

## Limites de compatibilidade

- Se a config programática/de usuário existente passar explicitamente `openaiCompatible.extra_body`, o runner continua fazendo o desempacotamento superficial pela lógica atual, mantendo a compatibilidade retroativa.
- A política de reasoning do próprio ZCode, o preenchimento do catálogo do workspace e o catálogo embutido não geram mais `extra_body`.
- Os campos diretos canônicos continuam sendo copiados para o namespace dinâmico de provider-name que o SDK realmente lê; a precedência existente do override de provider-name bruto permanece.
- sidecars curtos como title/goal-title continuam exigindo desligar o pensamento e compartilham a mesma conversão de no-thinking com reconhecimento de modelo; a geração de commit message do Git precisa distinguir a intenção da chamada: quando a requisição carrega uma variante explícita de pensamento, preserva o thinking/providerOptions escolhido pelo usuário; quando não há variante explícita, ainda projeta desligar o pensamento herdado conforme o sidecar de no-thinking. Causa do bug: a commit message é uma geração de mensagem de commit disparada ativamente pelo usuário, usando o modelo selecionado e a intensidade de pensamento atuais; o contrato antigo a agrupava com o sidecar automático de title, o que alterava incorretamente `max/high/low` de modelos que sempre pensam para disabled.
- A conversão de no-thinking precisa preservar as options originais antes de remover o esforço herdado: para um direct thinking toggle já existente, define disabled; para o GLM-5.2 e para modelos base GPT que suportam explicitamente `none`, converte o esforço para o canônico `reasoningEffort=none`. O MiniMax M3, quando as reasoning options estão ausentes, escreve o parâmetro oficial de desligamento conforme o `apiFormat` já existente; para modelos effort-only sem contrato de off, apenas remove o esforço herdado, sem forjar `none`.
- A minor version do GPT só reconhece a forma oficial com ponto (por exemplo `gpt-5.1`); snapshots de data do GPT-5 como `gpt-5-2025-08-07` não podem interpretar o ano como minor version nem gravar nele o `none` que não suporta.
- compact mantém os limites existentes; nenhum caminho pode criar `extra_body` para desligar o pensamento.

## Fora de escopo explícito

- Não remover a compatibilidade de desempacotamento do `extra_body` explícito do usuário.
- Não modificar as regras de reconhecimento de provider/modelo, os reasoning levels, a seleção padrão ou o snapshot do models-dev.
- Não adicionar inferência de Base URL, allowlist de campos, retry com remoção de campos após 400 nem casos especiais por provider.
- Não modificar UI, ZCode Protocol, persistência, filas, remote ou workspace identity.
- Não projetar context window, max output ou outros metadados do catálogo embutido para o runtime.

## Escopo de verificação

- Testes de policy/unit do adapter assertam de forma independente as provider options canônicas, sem copiar o helper de produção como esperado.
- Usando o `@ai-sdk/openai-compatible` real e um fetch fake, assertar diretamente o wire body final para GLM, DeepSeek, Qwen e o thinking toggle, e verificar que os caminhos gerados automaticamente pelo ZCode não contêm `extra_body` nem `chat_template_kwargs`.
- Testes table-driven do core sidecar cobrem GLM, DeepSeek, Qwen, Kimi K2/K3, MiMo, MiniMax, Claude e GPT: modelos que suportam off produzem os parâmetros corretos de desligamento, modelos sem off não forjam `none` e nenhum caminho ressintetiza `extra_body`.
- Testes de core runtime cobrem a commit message do Git: sem variante explícita, usa-se o esforço canônico do GLM-5.2 gerando `reasoningEffort=none` sem modificar as options da requisição principal; com variante explícita, preservam-se o thinking/providerOptions selecionados e combina-se o orçamento de output visível da commit message com o orçamento de thinking fixo da Anthropic em um orçamento total de wire válido.
- O E2E I14 verifica simultaneamente a requisição principal GLM-5.2 `max/nothink` e o title com `reasoning_effort=none`; o I15 verifica DeepSeek V4 `high/max`; o I65 verifica `enabled/off` para custom providers Qwen e Kimi criados por formulário. Os três partem da seleção na UI até o assert do corpo final da requisição capturado pelo replay server.