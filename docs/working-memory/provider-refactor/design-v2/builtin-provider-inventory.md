# Lista Histórica de Manutenção de Builtin Provider

> Este documento preserva a lista de alvos e as decisões do momento original da investigação; não representa a configuração atual nem o estado em tempo real do upstream.
> A partir de 2026-10-14, a manutenção diária está na [entrada de manutenção](../../../builtin-provider-maintenance/README.md),
> e os membros já configurados e a ativação/desativação padrão estão no [estado atual](../../../builtin-provider-maintenance/current-state.md).
> As tabelas e os trechos de remoção deste documento também têm diferenças históricas; não restaure nem remova modelos com base neles.

> Status: linha de base de manutenção Builtin no momento dos Todo 76/79; o inventário posterior foi movido para o novo diretório de manutenção.
>
> Data: 2026-09-10 (atualizado pelos Todo105/111/112/113)

Este documento responde apenas a "quais entradas o ZCode embutido oferece e quais modelos cada entrada mantém". Não é uma cópia do Provider Config e não descreve
reasoning map, campos de capacidade, Headers de requisição ou Personal Provider Instance.

A escolha de protocolo segue um princípio único: quando o fornecedor ou o modelo/Endpoint específico suporta Anthropic Messages, o template oficial prioriza o Anthropic; caso contrário, escolhe-se o outro API Schema que a entrada de fato suporta e que tenha a validação mais completa. Quando modelos diferentes exigem protocolos diferentes, a identidade do template é dividida, sem se fazer passar por uma entrada de protocolo fixo.

## Nível de manutenção

```text
重点维护：默认 enabled=true，作为产品首选和主要测试对象
一般维护：默认 enabled=false，仍提供完整配置和可选能力
不维护：不进入 Builtin Template，不做兼容迁移
```

"manutenção geral" não é uma camada Legacy/Compatibility; significa apenas que ainda tem valor real na entrada oficial, mas não é a recomendação padrão atual.

## Lista de entradas

Os IDs de modelo na tabela são o escopo de manutenção do produto. Entradas de API comuns usam `templateId`; entradas de conta usam um `providerId` concreto.
`account:zai-*` / `account:bigmodel-*` na tabela são apenas uma abreviação de documentação que reúne as entradas de plano do mesmo fornecedor; a configuração real mantém cada
Account Provider ID específico.

| Fornecedor                | Tipo             | ID                               | Base URL                                                 | Modelos mantidos pelo produto                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ---------------- | -------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z.AI Coding Plan API      | API Template     | `zai-api`                        | `https://api.z.ai/api/anthropic`                         | `GLM-5.3`★、`GLM-5.3-Flash`★                                                                                                                                                                                                                                                                                                                                                                                            |
| Z.AI API                  | API Template     | `zai-standard-api`               | `https://api.z.ai/api/paas/v4`                           | `GLM-5.3`★、`GLM-5.3-Flash`★、`GLM-5V-Turbo`★、`GLM-5.1`○、`GLM-5.1-Highspeed`○、`GLM-5`○、`GLM-5-Turbo`○、`GLM-4.7`○、`GLM-4.7-FlashX`○、`GLM-4.7-Flash`○、`GLM-4.6`○、`GLM-4.5-Air`○、`GLM-4.5`○、`GLM-4.6V`○、`GLM-4.6V-Flash`○、`GLM-4.6V-FlashX`○、`GLM-4.1V-Thinking-FlashX`○、`GLM-4.1V-Thinking-Flash`○、`GLM-4-FlashX-250414`○、`GLM-4-Flash-250414`○、`GLM-4V-Flash`○、`codegeex-4`○、`charglm-4`○、`emohaa`○ |
| BigModel Coding Plan API  | API Template     | `bigmodel-api`                   | `https://open.bigmodel.cn/api/anthropic`                 | `GLM-5.3`★、`GLM-5.3-Flash`★                                                                                                                                                                                                                                                                                                                                                                                            |
| BigModel API              | API Template     | `bigmodel-standard-api`          | `https://open.bigmodel.cn/api/paas/v4`                   | `GLM-5.3`★、`GLM-5.3-Flash`★、`GLM-5V-Turbo`★、`GLM-5.1`○、`GLM-5.1-Highspeed`○、`GLM-5`○、`GLM-5-Turbo`○、`GLM-4.7`○、`GLM-4.7-FlashX`○、`GLM-4.7-Flash`○、`GLM-4.6`○、`GLM-4.5-Air`○、`GLM-4.5`○、`GLM-4.6V`○、`GLM-4.6V-Flash`○、`GLM-4.6V-FlashX`○、`GLM-4.1V-Thinking-FlashX`○、`GLM-4.1V-Thinking-Flash`○、`GLM-4-FlashX-250414`○、`GLM-4-Flash-250414`○、`GLM-4V-Flash`○、`codegeex-4`○、`charglm-4`○、`emohaa`○ |
| Z.ai                      | Account Provider | `account:zai-*`                  | fixado pela entrada de plano                             | pessoal/equipe: `GLM-5.3`★、`GLM-5.3-Flash`★; Start／período ocioso mantêm suas próprias listas                                                                                                                                                                                                                                                                                                                              |
| BigModel                  | Account Provider | `account:bigmodel-*`             | fixado pela entrada de plano                             | pessoal/equipe: `GLM-5.3`★、`GLM-5.3-Flash`★; Start／período ocioso mantêm suas próprias listas                                                                                                                                                                                                                                                                                                                              |
| Kimi                      | API Template     | `moonshot-kimi`                  | `https://api.moonshot.cn/anthropic`                      | `kimi-k3`★、`kimi-k2.7-code`★、`kimi-k2.6`★、`k3`○、`k3-256k`○、`kimi-k2.5`○、`moonshot-v1-8k`○、`moonshot-v1-32k`○、`moonshot-v1-128k`○、`moonshot-v1-8k-vision-preview`○、`moonshot-v1-32k-vision-preview`○、`moonshot-v1-128k-vision-preview`○                                                                                                                                                                       |
| MiniMax                   | API Template     | `minimax`                        | `https://api.minimaxi.com/anthropic`                     | `MiniMax-M3`★、`MiniMax-M2.7`★、`MiniMax-M2.7-highspeed`★、`MiniMax-M2.5`○、`MiniMax-M2.5-highspeed`○、`MiniMax-M2.1`○、`MiniMax-M2.1-highspeed`○、`MiniMax-M2`○                                                                                                                                                                                                                                                        |
| DeepSeek                  | API Template     | `deepseek`                       | `https://api.deepseek.com/anthropic`                     | `deepseek-flash`★、`deepseek-v4-pro`★、`deepseek-v4-flash`○                                                                                                                                                                                                                                                                                                                                                             |
| Alibaba Cloud (China)     | API Template     | `qwen-alibaba-model-studio-cn`   | `https://dashscope.aliyuncs.com/apps/anthropic`          | `qwen3.8-max`★、`qwen3.8-flash`★、`qwen3.5-plus`○、`qwen3.5-flash`○、`qwen3-max`○、`qwen-plus`○、`qwen-flash`○、`qwen3-vl-plus`○                                                                                                                                                                                                                                                                                        |
| Alibaba Cloud (Global)    | API Template     | `qwen-alibaba-model-studio-intl` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen3.8-max`★、`qwen3.8-flash`★、`qwen3.5-plus`○、`qwen3.5-flash`○、`qwen3-max`○、`qwen-plus`○、`qwen-flash`○、`qwen3-vl-plus`○                                                                                                                                                                                                                                                                                        |
| Xiaomi MiMo              | API Template     | `xiaomi-mimo`                    | `https://api.xiaomimimo.com/anthropic`                   | `mimo-v2.5-pro`★、`mimo-v2.5`★、`mimo-v2-pro`○、`mimo-v2-omni`○、`mimo-v2-flash`○                                                                                                                                                                                                                                                                                                                                       |
| OpenAI                    | API Template     | `openai`                         | `https://api.openai.com/v1`                              | `gpt-6-astra`★、`gpt-5.6-sol`★、`gpt-5.6-terra`★、`gpt-5.6-luna`★、`gpt-5.6`○、`gpt-5.3-codex`○                                                                                                                                                                                                                                                                                                                         |
| Anthropic                 | API Template     | `anthropic`                      | `https://api.anthropic.com/v1`                           | `claude-fable-5-1`★、`claude-fable-5`★、`claude-opus-5`★、`claude-sonnet-5`★、`claude-haiku-4-5-20251001`★                                                                                                                                                                                                                                                                                                              |
| xAI                       | API Template     | `xai`                            | `https://api.x.ai/v1`                                    | `grok-4.6`★、`grok-build-0.1`★、`grok-4.3`○                                                                                                                                                                                                                                                                                                                                                                             |

`★` indica manutenção prioritária, habilitada por padrão; `○` indica manutenção geral, desabilitada por padrão.

### OpenRouter

O OpenRouter é um API Template comum e atualmente usa `templateId=openrouter`. O template oficial adota uniformemente o Anthropic Messages, com Base URL
`https://openrouter.ai/api`. Esta rodada pressupõe que todos os modelos mantidos na lista suportam essa entrada e não cria templates OpenRouter Chat/Responses adicionais; só quando surgir
contraevidência clara é que um Todo posterior tratará de outros Schemas.

O escopo de modelos cobre todos os modelos mantidos de cada API Template comum desta lista: enquanto o OpenRouter realmente os oferecer, todos entram, sem mais escolher apenas alguns
"modelos representativos". Cada fornecedor a montante tem pelo menos um modelo prioritário habilitado por padrão; os demais modelos do mesmo fornecedor ficam em manutenção geral, desabilitados por padrão. O catálogo dinâmico completo do próprio OpenRouter não é copiado para o Builtin Config, e modelos fora do escopo de manutenção do ZCode continuam disponíveis ao usuário por meio de um Provider customizado.

Os IDs de modelo do OpenRouter são registrados conforme os valores que ele realmente retorna. Por exemplo, pode aparecer `openai/gpt-5.6-sol`, que corresponde ao `gpt-5.6-sol` do fornecedor a montante; isso é apenas um fato de nomenclatura do OpenRouter, não um formato universal para todos os agregadores, e não exige que o runtime remova o prefixo. A configuração do OpenRouter continua mantida de forma independente, sem reutilizar as capacidades ou configurações de Option do Provider a montante.

A lista de manutenção alvo atual (com base nos IDs que realmente existem na Models API em 2026-09-04) está agrupada por fornecedor a montante:

A lista registra apenas IDs de modelo usáveis diretamente para requisições comuns de conversa/Agent; variantes de batch como `:batch` retornadas pelo OpenRouter não entram como membros de modelo, e variantes como `:free`, que afetam roteamento ou cobrança reais, só são registradas à parte quando precisarem de configuração independente.

- OpenAI：`openai/gpt-6-astra`★、`openai/gpt-5.6-sol`★、`openai/gpt-5.6-terra`★、`openai/gpt-5.6-luna`★、`openai/gpt-5.3-codex`○；
- Anthropic：`anthropic/claude-fable-5.1`★、`anthropic/claude-fable-5`★、`anthropic/claude-opus-5`★、`anthropic/claude-sonnet-5`★、`anthropic/claude-haiku-4.5`★、
  `anthropic/claude-opus-4.8`○、`anthropic/claude-opus-4.7`○、`anthropic/claude-opus-4.6`○、
  `anthropic/claude-opus-4.5`○、`anthropic/claude-sonnet-4.6`○、`anthropic/claude-sonnet-4.5`○；
- DeepSeek：`deepseek/deepseek-v4-pro`★、`deepseek/deepseek-v4-flash`★；
- Moonshot：`moonshotai/kimi-k3`★、`moonshotai/kimi-k2.7-code`○、`moonshotai/kimi-k2.6`○、`moonshotai/kimi-k2.5`○；
- Z.AI：`z-ai/glm-5.3`★、`z-ai/glm-5.3-flash`★、`z-ai/glm-5.2`○、`z-ai/glm-5.1`○、`z-ai/glm-5v-turbo`○、
  `z-ai/glm-5`○、`z-ai/glm-5-turbo`○、`z-ai/glm-4.7`○、`z-ai/glm-4.7-flash`○、`z-ai/glm-4.6`○、
  `z-ai/glm-4.6v`○、`z-ai/glm-4.5-air`○、`z-ai/glm-4.5`○；
- Qwen：`qwen/qwen3.8-max`★、`qwen/qwen3.8-flash`★、`qwen/qwen3.7-max`○、`qwen/qwen3.7-plus`○、
  `qwen/qwen3.7-flash`○、`qwen/qwen3.6-plus`○、`qwen/qwen3.6-flash`○、`qwen/qwen3.5-plus-20260420`○；
- MiniMax：`minimax/minimax-m3`★、`minimax/minimax-m2.7`○、`minimax/minimax-m2.5`○；
- Xiaomi MiMo：`xiaomi/mimo-v2.5-pro`★、`xiaomi/mimo-v2.5`★；
- xAI：`x-ai/grok-4.6`★、`x-ai/grok-build-0.1`○、`x-ai/grok-4.3`○。

### OpenCode Zen

Aqui, OpenCode refere-se à OpenCode Zen API, não ao runtime OpenCode Agent. O Zen usa o mesmo site
`https://opencode.ai/zen/v1`, mas os modelos são divididos em três Templates conforme o Endpoint/Schema oficial:

- `opencode-zen-responses`: GPT 5.6 Sol, Terra, Luna e outros modelos GPT Responses;
- `opencode-zen-messages`: modelos Anthropic Messages como Claude e Qwen;
- `opencode-zen-chat`: Kimi, DeepSeek, MiniMax, GLM e os modelos Chat gratuitos do Zen.

O escopo de manutenção do OpenCode Zen cobre os modelos de cada fornecedor que ainda são válidos na tabela oficial de modelos, sem omitir outras marcas só porque uma já tem um modelo prioritário. Cada marca a montante que entra na lista tem pelo menos um modelo prioritário habilitado por padrão; os demais modelos oficiais da mesma marca ficam em manutenção geral, desabilitados por padrão. A lista alvo atual, expandida por protocolo:

- Responses: `gpt-6-astra`★、`gpt-5.6-sol`★、`gpt-5.6-terra`★、`gpt-5.6-luna`★、`gpt-5.5`○、`gpt-5.5-pro`○、
  `gpt-5.4`○、`gpt-5.4-pro`○、`gpt-5.4-mini`○、`gpt-5.4-nano`○、`gpt-5.3-codex`○、`gpt-5.3-codex-spark`○、
  `gpt-5.2`○、`gpt-5.1`○;
- Anthropic Messages: `claude-fable-5-1`★、`claude-fable-5`★、`claude-opus-5`★、`claude-sonnet-5`★、`claude-haiku-4-5`○、
  `claude-opus-4-8`○、`claude-opus-4-7`○、`claude-opus-4-6`○、`claude-opus-4-5`○、
  `claude-sonnet-4-6`○、`claude-sonnet-4-5`○; Qwen: `qwen3.7-max`★、`qwen3.7-plus`○、`qwen3.6-plus`○、
  `qwen3.5-plus`○;
- OpenAI-compatible Chat: `kimi-k3`★、`minimax-m3`★、`minimax-m2.7`○、`deepseek-v4-pro`★、
  `deepseek-v4-flash`○、`glm-5.2`★、`glm-5.1`○、`big-pickle`★、`mimo-v2.5-free`★、`hy3-free`○、
  `ling-3.0-flash-fin-free`○、`nemotron-3-ultra-free`○、`nemotron-3.5-lightning-free`○、
  `muse-spark-1.2-contributor-free`○.

Acima está a lista de manutenção do ZCode, não o catálogo dinâmico completo do Zen; antes da gravação oficial, o retorno de `/zen/v1/models` do Zen e o resultado da verificação de protocolo continuam sendo a barreira final.

Para os modelos em "manutenção geral" de Z.ai, BigModel, Kimi, MiniMax e Qwen, a barreira final é a lista oficial de modelos disponíveis no momento da implementação para cada entrada de API específica; se algum ID não for mais aceito por essa entrada, ele é removido da tabela e do Template correspondente. Não se continua a manutenção aqui só porque o site oficial do fornecedor ainda guarda material histórico.

## Escopo de remoção

- Z.ai / BigModel contas pessoal/equipe e templates manuais de Coding Plan apenas predefinem `GLM-5.3` e `GLM-5.3-Flash`; não removem outras regras de modelo nem escolhas já salvas pelo usuário.
- Os templates comuns de API Z.ai / BigModel mantêm os outros modelos GLM oficiais em manutenção, com membros não prioritários desabilitados por padrão; não são misturados em uma única entrada com a Coding Plan API.
- Kimi remove `moonshot-v1-*`; K2.5/K2.6 ficam em manutenção geral enquanto a API oficial ainda os suportar, sem remoção direta apenas por terem numeração de versão mais antiga.
- MiniMax remove M2.1 e modelos anteriores; M2.7/M2.5 ainda constam nos documentos oficiais de lançamento e são mantidos como candidatos à manutenção geral.
- MiMo remove `mimo-v2-pro`, `mimo-v2-omni` e `mimo-v2-flash`; o oficial já anunciou que esses modelos antigos foram aposentados em 2026-06-30, e o alvo de migração é a série V2.5.
- Anthropic remove os Claude 3.x, Sonnet 4, Opus 4 e Opus 4.1 já aposentados; Opus 4.8/4.7, Sonnet 4.6 etc. continuam como manutenção geral.

## Limites desta rodada

- Esta rodada altera os membros de Template e as Model Rules dos Builtin Providers existentes e, conforme esta tabela, inclui OpenRouter e OpenCode Zen como duas entradas de API comuns.
- Azure, Volcano Ark e AWS Bedrock continuam sendo tratados pelo Todo 22 e não entram na tabela de entradas desta rodada.
- Google Gemini continua fora desta tabela por seu API Schema nativo independente.
- Modelos de fornecedores que não aparecem na tabela não entram em Builtin Template; o usuário ainda pode preenchê-los em um Provider customizado.

### Critério de inventário do OpenRouter / OpenCode

- O OpenRouter é um catálogo agregado dinâmico: seu catálogo completo não é copiado para o Builtin Config, mas também não se faz uma seleção estreita cobrindo apenas poucas marcas. O conjunto mantido é a interseção entre "os modelos a montante já mantidos nesta tabela" e os modelos que o OpenRouter realmente oferece: todos os modelos já mantidos de cada fornecedor que o OpenRouter oferece entram; de cada fornecedor pelo menos um modelo prioritário é habilitado por padrão, e os demais ficam em manutenção geral, desabilitados por padrão. Aqui, "cada fornecedor" refere-se aos fornecedores de API Template comuns desta tabela, sem contar de novo os Account Providers do mesmo fornecedor. IDs com sufixos como `/` ou `:free` são mantidos como são.
- A lista de modelos do OpenRouter é registrada conforme os IDs de modelo que ele realmente retorna; no exemplo atual, o `gpt-5.6-sol` a montante corresponde a `openai/gpt-5.6-sol`, mas isso é apenas um fato de nomenclatura do OpenRouter, não um formato universal para todos os agregadores, e não exige que o runtime remova o ID. Model Rule e Model+API Rule podem expressar variantes conhecidas por padrões de prefixo/sufixo, enquanto Template Model, Provider Model e Site Rule não usam esse tipo de wildcard de modelo. O conjunto de modelos é um escopo fechado de manutenção com atualização lenta; ao adicionar ou renomear, basta acrescentar uma regra `modelMatch` explícita.
- Os modelos oficiais do OpenCode usam o mesmo site, mas na prática se distribuem em três Endpoint/Schema diferentes: Responses, Anthropic Messages e OpenAI-compatible Chat. Atualmente o `api.type` do `ProviderTemplate` é de valor único, então o inventário registra primeiro três identidades de template: `responses`, `messages` e `chat`; na implementação não se faz passar modelos de Schemas diferentes por um template fixo, nem se estende um conjunto de campos temporários antes de um desenho de tipo.
- A lista de modelos do OpenCode segue o `/zen/v1/models` oficial e a documentação do Zen; ★/○ na tabela expressam apenas a estratégia de habilitação padrão do ZCode e não representam o nível de cobrança ou recomendação do Zen.
- O conjunto mantido do OpenCode Zen cobre os modelos de cada fornecedor que ainda são válidos em sua tabela oficial de modelos, sem omitir outras marcas só porque uma já tem um modelo prioritário; cada marca a montante com modelos na lista tem pelo menos um modelo habilitado por padrão, e os demais modelos oficiais ficam em manutenção geral, desabilitados por padrão.

## Fontes de referência

- [Z.AI Models](https://docs.z.ai/guides/overview/overview)
- [Kimi Code Models](https://www.kimi.com/code/docs/en/kimi-code/models.html)
- [DeepSeek Models](https://api-docs.deepseek.com/quick_start/pricing/)
- [Alibaba Model Studio Models](https://help.aliyun.com/en/model-studio/models)
- [Xiaomi MiMo API Models](https://mimo.mi.com/docs/en-US/quick-start/model)
- [OpenAI Models](https://platform.openai.com/docs/models/gpt-4-turbo-and-gpt-4)
- [Anthropic Model Deprecations](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)
- [MiniMax Model Releases](https://platform.minimaxi.com/docs/release-notes/models)
- [xAI Grok 4.6](https://docs.x.ai/developers/grok-4-6)
- [OpenRouter Models](https://openrouter.ai/docs/guides/overview/models)
- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenCode Zen](https://dev.opencode.ai/docs/zen)
