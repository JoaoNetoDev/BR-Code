# Casos de regressão P0 de tool result multimodal

## Objetivo

Verificar que, quando o ZCode converte o resultado de ferramentas MCP/integradas em
`tool_result.content[]` da Anthropic, os blocos de texto, imagens e textos de status não
sejam descartados silenciosamente na interface compatível da Anthropic da BigModel.

Este conjunto de casos cobre as duas fronteiras ao mesmo tempo:

```text
工具/MCP CallToolResult
        ↓
ZCode model-content projection
        ↓
Anthropic tool_result.content[]
        ↓
BigModel compatibility projection
        ↓
模型可见内容
```

O runner P0 lê apenas variáveis de ambiente e não guarda API key no código ou nos fixtures:

```bash
ANTHROPIC_API_KEY=... \
ZCODE_MODEL=glm-x-preview-f \
ZCODE_BASE_URL=https://open.bigmodel.cn/api/anthropic \
node scripts/multimodal-tool-result-p0.mjs
```

## Casos

| ID                         | Ordem dos blocos de entrada            | Alvo                                            | Significado da falha                  |
| -------------------------- | -------------------------------------- | ------------------------------------------------ | ------------------------------------- |
| `text-three-blocks`        | `text0, text1, text2`                  | Os três nonces visíveis e na mesma ordem          | A camada de compatibilidade descarta o texto seguinte silenciosamente |
| `mcp-text-image-text`      | `text, image, text`                    | Os dois textos e o marker dentro da imagem visíveis | Resultados mistos MCP comuns perdem blocos |
| `android-screenshot-shape` | `text, image`                          | Metadata e marker dentro do screenshot visíveis  | Imagem do screenshot Android perdida  |
| `ios-screenshot-shape`     | `text, image`                          | Metadata e marker dentro do screenshot visíveis  | Imagem do screenshot iOS perdida      |
| `browser-multiple-images`  | `imageA, imageB, text`                 | As duas imagens e o texto visíveis               | Imagens ou texto seguinte do Browser Use perdidos |
| `cua-observation`          | `image, frame_ref, ax_tree, outcome`   | raster, frame, AX tree e outcome visíveis        | Barreira de estado / restrição de ação do CUA perdida |
| `multiple-tool-results`    | Dois `tool_result` independentes, cada um com dois trechos de texto | O resultado de cada `tool_use_id` totalmente visível | Truncamento de projeção entre resultados de múltiplas ferramentas |

Todos os markers são unificados por um nonce gerado a cada execução; o prompt não contém os
valores dos markers, evitando que o modelo adivinhe a resposta a partir das instruções.

## Veredito

- `PASS`: HTTP 200, a saída do modelo contém todos os markers do case e a ordem está correta.
- `FAIL`: HTTP 200 mas algum marker está faltando, ou a ordem está errada.
- `BLOCKED`: o serviço de modelo devolve status de serviço como 403, 429, 529; não pode ser
  julgado como aprovação nem como falha da cadeia.

`scripts/multimodal-tool-result-p0.mjs` verifica apenas a semântica da interface compatível; a
cadeia real do ZCode exige confirmar separadamente que o `content[]` enviado pelo ZCode é
consistente com a saída da ferramenta.

Os resultados capturados servem apenas como evidência da cadeia; API key ou imagens base64 não
são gravadas nos fixtures de teste.