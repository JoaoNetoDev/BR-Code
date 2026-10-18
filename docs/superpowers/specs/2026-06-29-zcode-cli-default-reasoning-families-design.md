# Design de preenchimento das famílias de intensidade de raciocínio padrão do zcode-cli

## Contexto

Quando o usuário define um provider/model personalizado, o Catalog do lado do App pode não ter metadata de reasoning completa. O zcode-cli já possui uma camada de inferência padrão no overlay de provider dinâmico do workspace, mas hoje ela cobre apenas DeepSeek V4, GLM, GPT e alguns cenários Anthropic DeepSeek. Para modelos como Qwen, Kimi e MiMo, se o dynamic model passado pelo App não tiver `reasoning`, o catalog override gerado pelo agent não vai conter `supportsReasoning` e `reasoning.levels`, e as session settings posteriores também não terão intensidades de raciocínio selecionáveis.

Desta vez fazemos apenas o preenchimento do lado do zcode-cli, sem alterar a lógica de geração de Catalog do App/UI e sem introduzir shared inference.

## Objetivo

- Quando um dynamic provider model não tem metadata `reasoning`, o zcode-cli consegue preencher o reasoning padrão conforme o provider kind e a família do modelo.
- O provider Qwen OpenAI-compatible usa o canônico `openaiCompatible.enable_thinking` e não pode usar por engano o genérico `thinking.type`.
- Kimi/MiMo usam o toggle de thinking genérico: OpenAI-compatible usa o canônico `openaiCompatible.thinking.type` e Anthropic usa `anthropic.thinking`.
- Manter inalterado o comportamento de inferência padrão existente para DeepSeek V4, GLM-5.2 e GPT.
- A inferência automática gera apenas direct fields canônicos, nunca `extra_body`.

## Não objetivos

- Não alterar a lógica de exibição da lista de intensidades de raciocínio em `packages/ui`.
- Não alterar o armazenamento de App Catalog em `packages/services` nem o editor de modelos.
- Não criar formulário de override manual de reasoning.
- Não extrair o inference helper para um pacote shared.

## Design

O dynamic provider overlay em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts` é o único ponto de entrada de comportamento desta vez. Atualmente `createDynamicProviderDefaultReasoning(kind, modelId)` só consegue ver o provider kind e o model id; o Qwen precisa de reconhecimento pelo prefixo do provider id, portanto passa a receber o `provider` e o `model` completos.

Ordem da inferência padrão:

1. Kind Anthropic:
   - DeepSeek V4 continua usando o DeepSeek V4 Anthropic reasoning depth.
   - GLM-5.2 continua usando o GLM-5.2 Anthropic reasoning depth.
   - GLM, DeepSeek não V4, Kimi, MiMo e outras famílias de catálogo com thinking-toggle usam o Anthropic thinking toggle.
2. Kind OpenAI:
   - GPT continua usando o OpenAI provider reasoning effort.
   - Outras famílias não recebem parâmetros genéricos OpenAI-compatible.
3. Kind OpenAI-compatible:
   - GLM-5.2 continua usando o GLM-5.2 reasoning depth.
   - GPT continua usando o OpenAI-compatible reasoning effort.
   - DeepSeek V4 continua usando o DeepSeek V4 reasoning depth.
   - Qwen usa o toggle direto `enable_thinking`.
   - Kimi, MiMo, GLM e DeepSeek não V4 usam o toggle direto `thinking.type`.

`isCatalogThinkingToggleProtocolModel` continua sendo a fronteira unificada de reconhecimento para as famílias Kimi/MiMo/GLM/DeepSeek, mas o branch do Qwen precisa vir antes do branch genérico de thinking toggle.

## Testes

Adicionar em `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts` a cobertura de dynamic provider sem metadata de reasoning:

- Provider Qwen OpenAI-compatible: gera os níveis `enabled/disabled` e mapeia para `enable_thinking: true/false`.
- Provider Moonshot Kimi OpenAI-compatible: gera os níveis `enabled/disabled` e mapeia para o genérico `thinking.type`.
- Provider Xiaomi MiMo Anthropic: gera os níveis `enabled/disabled` e mapeia para `anthropic.thinking`.

Rodar o vitest direcionado para regressão e depois o `pnpm typecheck` e o `pnpm lint` exigidos pelo projeto.