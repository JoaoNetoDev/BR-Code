# Configuração atual e estado de manutenção

Novos candidatos, lacunas do catálogo público e divergências no parsing de regras estão no [Plano de expansão](./expansion-plan.md). O texto abaixo ainda registra a configuração real da revision 33; as recomendações de pesquisa ainda não foram implementadas.

## Baseline e critérios

- Data da verificação: 2026-10-14 (horário de Beijing). Baseline de código: staging `68fac8de4fcc69972dc8c0a44b939702d3c571ea`, versão 3.15.3 do código-fonte do produto; não significa que essa versão tenha sido publicada.
- Formal e de teste usam ambos schemaVersion 1, revision 33. Este MR de documentação não alterou a configuração nem a revision.
- 21 templates de API comuns, 10 Providers de conta fixa; os membros de template somam 246 entradas, incluindo modelos repetidos entre templates.
- 83 regras de Model, 73 regras de Model+API, 54 regras de Site formal, 63 regras de Site de teste, 248 regras exatas de template, 30 regras exatas de Provider fixo.
- SHA-256 do arquivo formal: `361b778f89496a37540d23a9d309efe6cb8fc97d557119cefbffc67df2f93998`.
- SHA-256 do arquivo de teste: `ae897a66877b52ff4b227e2a972e9a1aa15ac33de7493ab78d72a15dd68c6374`. O hash aponta para o conteúdo Git do baseline (LF); um checkout local com CRLF precisa ser normalizado pelas quebras de linha do repositório antes da comparação.

A lista é extraída diretamente do [JSON formal](../../config/provider/zcode-builtin.json). A ativação/desativação abaixo é a das regras exatas de template, sem вклюuir sobrescritas do usuário nem Key/direitos reais; estar na lista não significa que essa entrada já tenha sido de fato verificada nesta rodada.

## Resumo dos templates

| templateId                       | Protocolo                   | Nº de membros | Habilitados por padrão |
| -------------------------------- | --------------------------- | ------------- | --------------------- |
| `zai-api`                        | `anthropic-messages`        | 2             | 2                     |
| `zai-standard-api`               | `openai-chat-completions`   | 24            | 2                     |
| `bigmodel-api`                   | `anthropic-messages`        | 2             | 2                     |
| `bigmodel-standard-api`          | `openai-chat-completions`   | 24            | 2                     |
| `moonshot-kimi`                  | `anthropic-messages`        | 6             | 3                     |
| `minimax`                        | `anthropic-messages`        | 8             | 3                     |
| `deepseek`                       | `anthropic-messages`        | 2             | 2                     |
| `qwen-alibaba-model-studio-cn`   | `anthropic-messages`        | 13            | 2                     |
| `qwen-alibaba-model-studio-intl` | `openai-chat-completions`   | 14            | 2                     |
| `xiaomi-mimo`                    | `anthropic-messages`        | 4             | 4                     |
| `xiaomi-mimo-token-plan`         | `anthropic-messages`        | 2             | 2                     |
| `openai`                         | `openai-responses`          | 10            | 4                     |
| `anthropic`                      | `anthropic-messages`        | 5             | 5                     |
| `xai`                            | `openai-responses`          | 3             | 2                     |
| `openrouter`                     | `anthropic-messages`        | 59            | 11                    |
| `opencode-go-chat`               | `openai-chat-completions`   | 15            | 8                     |
| `opencode-go-messages`           | `anthropic-messages`        | 8             | 3                     |
| `opencode-go-responses`          | `openai-responses`          | 2             | 2                     |
| `opencode-zen-responses`         | `openai-responses`          | 14            | 2                     |
| `opencode-zen-messages`          | `anthropic-messages`        | 15            | 5                     |
| `opencode-zen-chat`              | `openai-chat-completions`   | 14            | 10                    |

## Membros completos e ativação/desativação padrão

Aqui ficam todos os membros de template, para facilitar a revisão de adições e remoções; capacidades e parâmetros não são copiados para outra configuração, são resolvidos conforme o [contrato de regras](./configuration.md). Configurações posteriores em MR atualizam esta seção, o resumo e o baseline.

### zai-api

- Base URL: `https://api.z.ai/api/anthropic`; Access: `zhipu-coding-plan-api-key`.
- Habilitados por padrão: `GLM-5.3`, `GLM-5.3-Flash`.
- Desabilitados por padrão: nenhum.

### zai-standard-api

- Base URL: `https://api.z.ai/api/paas/v4`; Access: `api-key`.
- Habilitados por padrão: `GLM-5.3`, `GLM-5.3-Flash`.
- Desabilitados por padrão: `GLM-5V-Turbo`, `GLM-5.1`, `GLM-5.1-Highspeed`, `GLM-5`, `GLM-5-Turbo`, `GLM-4.7`, `GLM-4.7-FlashX`, `GLM-4.7-Flash`, `GLM-4.6`, `GLM-4.5-Air`, `GLM-4.5`, `GLM-4.6V`, `GLM-4.6V-Flash`, `GLM-4.6V-FlashX`, `GLM-4.1V-Thinking-FlashX`, `GLM-4.1V-Thinking-Flash`, `GLM-4-FlashX-250414`, `GLM-4-Flash-250414`, `GLM-4V-Flash`, `codegeex-4`, `charglm-4`, `emohaa`.

### bigmodel-api

- Base URL: `https://open.bigmodel.cn/api/anthropic`; Access: `zhipu-coding-plan-api-key`.
- Habilitados por padrão: `GLM-5.3`, `GLM-5.3-Flash`.
- Desabilitados por padrão: nenhum.

### bigmodel-standard-api

- Base URL: `https://open.bigmodel.cn/api/paas/v4`; Access: `api-key`.
- Habilitados por padrão: `GLM-5.3`, `GLM-5.3-Flash`.
- Desabilitados por padrão: `GLM-5V-Turbo`, `GLM-5.1`, `GLM-5.1-Highspeed`, `GLM-5`, `GLM-5-Turbo`, `GLM-4.7`, `GLM-4.7-FlashX`, `GLM-4.7-Flash`, `GLM-4.6`, `GLM-4.5-Air`, `GLM-4.5`, `GLM-4.6V`, `GLM-4.6V-Flash`, `GLM-4.6V-FlashX`, `GLM-4.1V-Thinking-FlashX`, `GLM-4.1V-Thinking-Flash`, `GLM-4-FlashX-250414`, `GLM-4-Flash-250414`, `GLM-4V-Flash`, `codegeex-4`, `charglm-4`, `emohaa`.

### moonshot-kimi

- Base URL: `https://api.moonshot.cn/anthropic`; Access: `api-key`.
- Habilitados por padrão: `kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`.
- Desabilitados por padrão: `kimi-k2.7-code-highspeed`, `k3`, `k3-256k`.

### minimax

- Base URL: `https://api.minimaxi.com/anthropic`; Access: `api-key`.
- Habilitados por padrão: `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`.
- Desabilitados por padrão: `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, `MiniMax-M2`.

### deepseek

- Base URL: `https://api.deepseek.com/anthropic`; Access: `api-key`.
- Habilitados por padrão: `deepseek-flash`, `deepseek-v4-pro`.
- Desabilitados por padrão: nenhum.

### qwen-alibaba-model-studio-cn

- Base URL: `https://dashscope.aliyuncs.com/apps/anthropic`; Access: `api-key`.
- Habilitados por padrão: `qwen3.8-max`, `qwen3.8-flash`.
- Desabilitados por padrão: `qwen3.7-max`, `qwen3.7-plus`, `qwen3.7-flash`, `qwen3.6-plus`, `qwen3.6-flash`, `qwen3.5-plus`, `qwen3.5-flash`, `qwen3-max`, `qwen-plus`, `qwen-flash`, `qwen3-vl-plus`.

### qwen-alibaba-model-studio-intl

- Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; Access: `api-key`.
- Habilitados por padrão: `qwen3.8-max`, `qwen3.8-flash`.
- Desabilitados por padrão: `qwen3.8-omni-flash`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.7-flash`, `qwen3.6-plus`, `qwen3.6-flash`, `qwen3.5-plus`, `qwen3.5-flash`, `qwen3-max`, `qwen-plus`, `qwen-flash`, `qwen3-vl-plus`.

### xiaomi-mimo

- Base URL: `https://api.xiaomimimo.com/anthropic`; Access: `api-key`.
- Habilitados por padrão: `mimo-v2.6-pro`, `mimo-v2.6-flash`, `mimo-v2.5-pro`, `mimo-v2.5`.
- Desabilitados por padrão: nenhum.

### xiaomi-mimo-token-plan

- Base URL: `https://token-plan-cn.xiaomimimo.com/anthropic`; Access: `api-key`.
- Habilitados por padrão: `mimo-v2.6-pro`, `mimo-v2.6-flash`.
- Desabilitados por padrão: nenhum.

### openai

- Base URL: `https://api.openai.com/v1`; Access: `api-key`.
- Habilitados por padrão: `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`.
- Desabilitados por padrão: `gpt-5.6`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.3-codex`.

### anthropic

- Base URL: `https://api.anthropic.com/v1`; Access: `api-key`.
- Habilitados por padrão: `claude-fable-5-1`, `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`.
- Desabilitados por padrão: nenhum.

### xai

- Base URL: `https://api.x.ai/v1`; Access: `api-key`.
- Habilitados por padrão: `grok-4.6`, `grok-build-0.1`.
- Desabilitados por padrão: `grok-4.3`.

### openrouter

- Base URL: `https://openrouter.ai/api`; Access: `api-key`.
- Habilitados por padrão: `anthropic/claude-fable-5.1`, `openai/gpt-6-astra`, `openai/gpt-5.6-sol`, `anthropic/claude-opus-5`, `deepseek/deepseek-v4-pro`, `moonshotai/kimi-k3`, `z-ai/glm-5.3`, `qwen/qwen3.8-max`, `minimax/minimax-m3`, `xiaomi/mimo-v2.5-pro`, `x-ai/grok-4.6`.
- Desabilitados por padrão: `deepseek/deepseek-v4.1-flash`, `qwen/qwen3.8-max-0902`, `openai/gpt-5.6-terra`, `openai/gpt-5.6-luna`, `openai/gpt-5.6`, `openai/gpt-5.4`, `openai/gpt-5.4-pro`, `openai/gpt-5.4-mini`, `openai/gpt-5.4-nano`, `openai/gpt-5.3-codex`, `anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4.5`, `anthropic/claude-opus-4.8`, `anthropic/claude-opus-4.7`, `anthropic/claude-opus-4.6`, `anthropic/claude-opus-4.5`, `anthropic/claude-sonnet-4.6`, `anthropic/claude-sonnet-4.5`, `deepseek/deepseek-v4-flash`, `moonshotai/kimi-k2.7-code`, `moonshotai/kimi-k2.6`, `moonshotai/kimi-k2.5`, `z-ai/glm-5.3-flash`, `z-ai/glm-5.2`, `z-ai/glm-5.1`, `z-ai/glm-5v-turbo`, `z-ai/glm-5`, `z-ai/glm-5-turbo`, `z-ai/glm-4.7`, `z-ai/glm-4.7-flash`, `z-ai/glm-4.6`, `z-ai/glm-4.6v`, `z-ai/glm-4.5-air`, `z-ai/glm-4.5`, `qwen/qwen3.8-flash`, `qwen/qwen3.7-max`, `qwen/qwen3.7-plus`, `qwen/qwen3.7-flash`, `qwen/qwen3.6-plus`, `qwen/qwen3.6-flash`, `qwen/qwen3.5-plus-20260420`, `qwen/qwen3-vl-plus`, `qwen/qwen3-vl-flash`, `minimax/minimax-m2.7`, `minimax/minimax-m2.5`, `xiaomi/mimo-v2.5`, `x-ai/grok-build-0.1`, `x-ai/grok-4.3`.

### opencode-go-chat

- Base URL: `https://opencode.ai/zen/go/v1`; Access: `api-key`.
- Habilitados por padrão: `glm-5.3-flash`, `glm-5.3`, `kimi-k3`, `kimi-k2.7-code`, `deepseek-v4.1-flash`, `deepseek-v4-pro`, `mimo-v2.5`, `mimo-v2.5-pro`.
- Desabilitados por padrão: `glm-5.2`, `glm-5.1`, `kimi-k2.6`, `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `hy4-preview`, `hy3`.

### opencode-go-messages

- Base URL: `https://opencode.ai/zen/go/v1`; Access: `api-key`.
- Habilitados por padrão: `minimax-m3`, `qwen3.8-max`, `qwen3.8-flash`.
- Desabilitados por padrão: `minimax-m2.7`, `minimax-m2.5`, `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-plus`.

### opencode-go-responses

- Base URL: `https://opencode.ai/zen/go/v1`; Access: `api-key`.
- Habilitados por padrão: `gpt-5.6-luna`, `grok-4.6`.
- Desabilitados por padrão: nenhum.

### opencode-zen-responses

- Base URL: `https://opencode.ai/zen/v1`; Access: `api-key`.
- Habilitados por padrão: `gpt-6-astra`, `gpt-5.6-sol`.
- Desabilitados por padrão: `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.2`, `gpt-5.1`.

### opencode-zen-messages

- Base URL: `https://opencode.ai/zen/v1`; Access: `api-key`.
- Habilitados por padrão: `claude-fable-5-1`, `claude-fable-5`, `qwen3.7-max`, `qwen3.6-plus`, `qwen3.5-plus`.
- Desabilitados por padrão: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5`, `qwen3.7-plus`.

### opencode-zen-chat

- Base URL: `https://opencode.ai/zen/v1`; Access: `api-key`.
- Habilitados por padrão: `kimi-k3`, `minimax-m3`, `deepseek-v4-pro`, `glm-5.2`, `big-pickle`, `mimo-v2.5-free`, `hy3-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`, `muse-spark-1.2-contributor-free`.
- Desabilitados por padrão: `minimax-m2.7`, `deepseek-v4-flash`, `glm-5.1`, `nemotron-3.5-lightning-free`.

## Configuração adjacente de contas fixas

O tema de manutenção desta rodada são os templates comuns; os Providers de conta fixa e seus Release compartilhado e regras de modelo são, por isso, contabilizados sem copiar a explicação do sistema de contas. Z.AI / BigModel têm, cada um, as modalidades pessoal, equipe, Start, ociosa e cartão de aceleração, totalizando 10 Providers fixos. O gerador de teste cobre o mapeamento dos endpoints formais envolvidos nesses cinco caminhos de produto.

## Diferenças conhecidas e próximos passos

| Item                          | Fato confirmado                                                                                                                                      | Limite de tratamento                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Simplificação do baseline     | a revision 32 já implementou o baseline de janela de 1 milhão/128000 de saída máxima, a correspondência simplificada e a remoção de duas regras            | as compensações e os limites de compatibilidade estão em [Correspondência e simplificação](./configuration.md#correspondência-e-simplificação); deixa de ser item pendente |
| Deriva do inventário          | a lista de manutenção antiga difere em parte dos modelos e da ativação/desativação padrão desta seção; por exemplo, no template comum GLM o `GLM-5V-Turbo` está desabilitado por padrão agora | a configuração não é alterada automaticamente por asteriscos históricos; mudanças de ativação/desativação exigem um MR de comportamento separado |
| Regras fora dos membros estáticos | `zai-api`/`bigmodel-api` têm cada um uma regra de `GLM-5-Turbo` desabilitado por padrão, mas esse não é um membro atual do template; os quatro Providers pessoal/equipe têm regras exatas de `GLM-5.2` e `GLM-5-Turbo` que excedem seus membros estáticos | conferir antes os modelos pessoais de mesmo ID, os membros dinâmicos e os usos históricos; não pode ser classificado diretamente como órfão a remover |
| Intenção de remoção histórica  | o trecho de remoções do inventário antigo diverge dos membros mantidos hoje, como MiniMax M2.1/M2                                               | reverificar a entrada upstream e a decisão de produto; não remover neste MR de documentação |
| Dupla entrada de produto MiMo | a revision 33 já contém o template de API comum `xiaomi-mimo` e o template de plano `xiaomi-mimo-token-plan`; o primeiro habilita V2.6 Pro/Flash e V2.5 Pro/V2.5, o segundo habilita V2.6 Pro/Flash | já integrado ao staging; nesta rodada a verificação é por código e testes, o que não equivale a dizer que as chamadas reais com Key dos dois produtos ou a adoção em produção foram verificadas |
| Novos fornecedores/entradas de nuvem | Gemini e Mistral não têm template embutido; Azure/Ark/Bedrock continuam como candidatos                                                                    | tudo o que a cadeia de execução atual suporta diretamente pode avançar; caminhos que exigem adaptação adicional ficam adiados; candidato não significa verificado |
| Novas mudanças no catálogo oficial | OpenAI, Anthropic, Z.AI, xAI, MiMo e OpenCode têm itens a revisar                                                                                    | ver o [registro de pesquisa](./research.md); não é uma mudança de configuração já verificada |
| Estado em produção             | nesta rodada não foi consultado o plano de controle de produção/teste nem o pacote de instalação real                                                | não se pode inferir que a versão em produção também é 33 a partir da revision 33 do código-fonte |

## Estado de verificação

A estrutura de configuração, os membros de template e as estatísticas de regras deste baseline foram conferidos estaticamente; nesta rodada `pnpm provider:config:check-test` passou, e os membros de todos os 21 templates, a ativação/desativação padrão e os dois hashes de configuração foram reconciliados item a item com o corpo do texto. Os testes unitários direcionados da simplificação histórica de capacidade e a validação no desktop Linux não contam como resultado de aprovação desta rodada, e também não equivalem a uma medição atual de todos os fornecedores.

Após sincronizar a revision 33, a integridade da configuração formal e os testes de dupla template do MiMo passaram em 2 arquivos, 17 casos; a reexecução do teste de integridade na configuração de teste especificada passou em 1 arquivo, 15 casos. O teste do MiMo cobre membros nos dois ambientes, o Map de parâmetros e a preservação das sobrescritas de instâncias antigas. As duas configurações e o teste unitário/caso de navegador do MiMo estão em conformidade total com este baseline de staging; este MR de documentação não removeu nem reverteu esse conteúdo.

Nesta rodada não foi obtida nenhuma API Key, não foi executada nenhuma requisição de API com cobrança e não foram reexecutadas as aceitações completas por fornecedor, desktop/celular e entre sistemas. Todo novo item de manutenção precisa trazer a [evidência de verificação](./validation.md) no próprio registro.

## Checklist de reconferência

Execute os comandos somente de leitura abaixo a partir da raiz do repositório; eles imprimem os membros atuais e as regras exatas correspondentes, e verificam ao mesmo tempo as derivações formal/de teste, sem tomar documentos antigos como fonte de configuração:

```bash
node --input-type=module - <<'JS'
import { readFile } from 'node:fs/promises';
const release = JSON.parse(await readFile('config/provider/zcode-builtin.json', 'utf8'));
const rules = release.config.modelConfigRules.templateModelRules;
for (const template of release.config.providerConfigRules.templateRules) {
  console.log(template.templateId, template.config.api);
  for (const modelId of template.config.builtinModelIds) {
    console.log(modelId, rules.filter(rule =>
      rule.templateId === template.templateId && rule.modelId === modelId));
  }
}
JS
pnpm provider:config:check-test
```
