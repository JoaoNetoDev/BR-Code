# Evidências de modelos e capacidades dos principais modelos de Built-in Provider (2026-08)

> Status: evidência publicada da revisão inicial 4; em 2026-09-01 foi acrescentada a correção multimodal do Kimi
>
> Base de design: [`zcode-builtin-provider-config.md`](../design/registry/zcode-builtin-provider-config.md)

## 1. Regras de evidência

Este relatório registra apenas a base usada pelo publicador para manter a Built-in Config e não adiciona campos de evidence, confidence ou provenance à Config de runtime. Os fatos são decididos nesta ordem:

```text
ZCode 产品或账号服务的已确认契约
          |
          v
Models API 实时成功响应（若厂商提供）
          |
          v
当前官方模型/API 文档
          |
          v
第三方兼容场景的保守推断
```

- Contexto, max output, formato de entrada e capacidades de protocolo declarados explicitamente no site oficial podem entrar na Rule correspondente de Model/API/Endpoint.
- Capacidades oferecidas adicionalmente pela cadeia de planos ZCode entram em uma Rule de escopo de Provider e não podem reescrever retroativamente os fatos nativos do modelo.
- Exemplos na documentação da Models API provam apenas o formato da resposta e não substituem o catálogo em tempo real com o material de acesso atual.
- Modelos candidatos não listados no site oficial podem manter regras conservadoras para serviços compatíveis de terceiros; enquanto o Endpoint oficial alvo não for confirmado, não são habilitados por padrão.
- O fato de a requisição aceitar um campo, ignorar um conteúdo ou não gerar erro não significa que o modelo consumiu aquela entrada e não constitui evidência de capacidade.
- "JSON Output" ou JSON Object não equivalem a JSON Schema estrito; o campo atual `supportsJsonSchemaOutput` só é habilitado em linhas cujo Schema estrito já foi provado; a renomeação do campo foi assumida pelo Todo74, que fechou o Todo39.

## 2. Matriz de conclusões por fornecedor

| Fornecedor              | Modelo principal/único desta rodada                                      | Fatos oficiais principais                                                                          | Habilitado por padrão nesta rodada | Principais pontos conservadores                                                            |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| GLM / Z.ai / BigModel | `glm-5.3`、`glm-5.3-flash`、`glm-5v-turbo`             | O 5.3 é o flagship de texto; o 5.3 Flash é nativo Text/Image/Video; 1M de contexto, 128K de saída                          | Os três         | O 5.3 da Account API comum não declara visão; 5.x/4.x antigos ficam desligados por padrão                          |
| Coding Plan           | `GLM-5.3`、`GLM-5.3-Flash`、`GLM-5.2`、`GLM-5-Turbo`   | Membros estáticos Individual/Team; o serviço do Plan oferece transcrição Image/Video aos membros                                               | Os quatro         | Não inferir Audio/PDF; o Start ainda é restringido pelos membros retornados pela conta                                       |
| Kimi                  | `kimi-k3`、`kimi-k2.7-code`、`kimi-k2.6`               | K3 com 1M e suporte a Image/Video; K2.7 Code com 256K e suporte a Image/Video; K2.6 com 256K e suporte a Text/Image/Video       | Os três         | `k3` suporta Image/Video; `k3-256k` só suporta Image; alias e K2.x/Moonshot V1 antigos ficam desligados por padrão |
| MiniMax               | `MiniMax-M3`、`MiniMax-M2.7`、`MiniMax-M2.7-highspeed` | O M3 é o principal atual, 1M, Text/Image/Video, com suporte explícito a Endpoint Anthropic/OpenAI na China; M2.7 com 204800     | Os três         | O max output do M3 ainda adota um valor conservador; exemplos na doc da Models API não são catálogo de membros em tempo real                          |
| DeepSeek              | `deepseek-v4-flash`、`deepseek-v4-pro`                 | 1M de contexto, 384K de saída, Text, Tool; suporta Anthropic/ChatCompletions; Pro/Flash novos suportam low/high/max             | Os dois         | JSON Output não se difunde como Schema estrito; Schema estrito de Responses é tratado por API/Endpoint separadamente   |
| Qwen                  | `qwen3.8-max`、`qwen3.8-flash`                         | 1M de contexto, 131072 de saída, Text/Image/Video, Tool; ambos suportam JSON Schema estrito                             | Os dois         | 3.5/3.x antigos são mantidos mas desligados por padrão; busca nativa não equivale a ativar automaticamente a ferramenta de busca no lado da aplicação                     |
| MiMo                  | `mimo-v2.5-pro`、`mimo-v2.5`                           | Ambos 1M/128K; o Pro é de texto; o v2.5 suporta Image/Video/Audio; a antiga série v2 já foi descontinuada                                 | Os dois         | Saída estruturada é conservadora no protocolo atual; Audio entra apenas como fato estático, sem nova entrada de codificação nesta rodada                |
| OpenAI                | `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`         | Três faixas de 1.05M/128K, Text/Image, Tools, saída estrita; `gpt-5.6` é alias de Sol                                              | Os três IDs reais  | Alias e Codex antigos ficam desligados por padrão, evitando entradas duplicadas                                              |
| Anthropic             | Fable 5, Opus 5, Sonnet 5, Haiku 4.5                   | Todos Text/Image/Tool; os três primeiros 1M/128K, Haiku 200K/64K                                                                              | As quatro faixas únicas | PDF é capacidade da doc da Messages API, mantendo o fato atual; sem difusão de Video/Audio                     |
| xAI                   | `grok-4.6`、`grok-build-0.1`                           | O 4.6 é Text/Image, 500K, Tool, saída estrita; o Build é a faixa de coding com 256K                                                    | Os dois         | `grok-4.3` fica desligado por padrão                                                                 |

## 3. Limite visual entre Account e planos

A Account API comum e o Coding Plan precisam ficar separados:

```text
普通 Account API + glm-5.3
└─ 原生 Text；Image/Video=false

普通 Account API + glm-5.3-flash
└─ 原生 Text/Image/Video

Start / Individual / Team Plan
└─ Provider 服务为其实际成员提供 Image/Video 转写
```

A Account API comum aceita requisições com imagem sem gerar erro, o que só indica que o servidor tolera ou ignora o conteúdo e não prova que `glm-5.3` tenha visão.
Por isso, nesta rodada a capacidade nativa de visão dele é mantida como `false`. A capacidade visual do Plan vem da cadeia de produto ZCode e é um fato independente do serviço do Provider.

## 4. Membros de Provider e ordem inicial desta rodada

A ordem física de `builtinModelIds` segue "default enabled primeiro, default disabled depois". Essa é apenas a ordem inicial do arquivo publicado; o runtime não adiciona um ordenador, e o `modelOrder` Personal após o arrasto do usuário continua sendo o fato de ordem do usuário.

- GLM API: 5.3, 5.3 Flash e 5V Turbo primeiro; os demais membros históricos depois.
- Individual/Team: 5.3, 5.3 Flash, 5.2, 5-Turbo.
- Kimi: K3, K2.7 Code e K2.6 primeiro.
- MiniMax: M3 primeiro; M2.7 e M2.7 Highspeed em seguida como faixas de velocidade que ainda atendem normalmente, com os três habilitados por padrão.
- Qwen: os Providers da China e internacional começam com 3.8 Max e 3.8 Flash.
- MiMo: 2.5 Pro e 2.5 primeiro.
- OpenAI: Sol, Terra e Luna primeiro; alias e modelos antigos depois.
- Anthropic: as quatro faixas distintas de preço/velocidade, todas habilitadas.
- xAI: 4.6 e Build primeiro; 4.3 depois.

## 5. Material oficial

- GLM：[模型总览](https://docs.bigmodel.cn/cn/guide/start/model-overview)
- Kimi：[API 模型选择](https://www.kimi.ai/help/kimi-api/api-model-selection)、[K3 发布说明](https://www.kimi.com/news/kimi-k3)、[K2.7 Code 模型说明](https://www.kimi.ai/resources/kimi-k2-7-code)、[Kimi Code 模型表](https://www.kimi.com/code/docs/en/kimi-code/models.html)
- MiniMax：[模型调用](https://platform.minimaxi.com/docs/guides/text-generation)、[Anthropic Models API](https://platform.minimaxi.com/docs/api-reference/models/anthropic/list-models)、[OpenAI Models API](https://platform.minimaxi.com/docs/api-reference/models/openai/list-models)
- DeepSeek：[模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)、[更新日志](https://api-docs.deepseek.com/updates/)、[Responses API](https://api-docs.deepseek.com/api/create-response/)
- Qwen：[Qwen3.8 Max](https://help.aliyun.com/en/model-studio/qwen3-8-max)、[Qwen3.8 Flash](https://help.aliyun.com/en/model-studio/qwen3-8-flash)、[Structured Output](https://help.aliyun.com/en/model-studio/qwen-structured-output)
- MiMo：[模型总览](https://mimo.mi.com/docs/en-US/quick-start/model)、[Audio Understanding](https://mimo.mi.com/docs/en-US/usage-guide/multimodal-understanding/audio-understanding)
- OpenAI：[Models](https://developers.openai.com/api/docs/models)
- Anthropic：[Models Overview](https://platform.claude.com/docs/en/models/overview)
- xAI：[Grok 4.6](https://docs.x.ai/developers/models/grok-4.6)、[Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)

## 6. Imperfeições conhecidas e validação da próxima rodada

O objetivo desta rodada é formar uma linha de base publicada mais confiável que a revisão 3, e não reivindicar a conclusão de medições reais de Endpoint com material de acesso. A validação futura da API de modelos deve priorizar a chamada da Models API do fornecedor e depois validar as capacidades que a interface não oferece:

1. A lista de modelos de cada Endpoint real com o material de acesso atual, seus aliases e os metadados opcionais de capability;
2. Tool, reasoning, MCS e JSON Schema estrito nos três Schemas de API;
3. Se Image/Video/Audio/PDF são realmente consumidos, e não apenas aceitos ou ignorados;
4. Max output, a faixa padrão de reasoning e os limites do servidor;
5. Relato automático de divergência entre a documentação oficial e a interface de produto da conta.

Nesses casos, a Models API compatível com OpenAI costuma retornar apenas a identidade básica; a Models API oficial da Anthropic ainda pode retornar, além do limite de tokens, capacidades como Image/PDF, Thinking, Effort e Structured Outputs. Serviços compatíveis de terceiros podem implementar apenas um subconjunto, e tanto a análise quanto a adoção de evidências precisam seguir os campos realmente presentes, sem completar pelo nome do protocolo.

## 7. Correção de evidências do Kimi em 2026-09-01

A re-revisão desta rodada identificou que a atualização da revisão 4 confundiu "o resumo não registrou multimodal" com "não há suporte", e a configuração posterior deu continuidade a esse erro. O material oficial atual já é claro:

- A página de seleção de modelos da API do Kimi declara que `kimi-k3` tem compreensão visual nativa; o material de lançamento do K3 esclarece que a arquitetura nativa compreende texto, imagem e vídeo;
- O FAQ oficial do Kimi K2.7 Code declara explicitamente entradas Text, Image e Video;
- A tabela de modelos do Kimi Code declara que `k3` suporta Image/Video e que `k3-256k` suporta apenas Image.

Portanto, a revisão 7 corrige esses três fatos. De agora em diante, quando uma capacidade publicada como `true` for rebaixada para `false`, será necessária evidência negativa explícita ou um resultado de requisição reproduzível; a ausência de material não pode mais servir de base.