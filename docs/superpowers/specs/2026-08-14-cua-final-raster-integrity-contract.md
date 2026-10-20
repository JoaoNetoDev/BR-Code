# CUA — contrato final de integridade de imagem e coordenadas de pixel

Status: contrato de implementação

Baseline congelado: `3ee0eadbe3dfda41a65bf2ac1a0d4ab761311060`
(`origin/feat/cua-merge`)

Design upstream: Feishu `O3s2dIIooo1uuExdipOcVJ9Vnvg`, revision 75 (V3).

Implementação do producer: pacote de workspace `packages/zcode-cua` (baseline de importação `zcode-cua@4a3c507dd16f3ed840e87bc92e709ce339e6a4f3`; inclui image-first, binding interno de frame no transport e guidance de recuperação raster-only).

A revision inclui simultaneamente a simplificação da surface do producer 0.5.7, a autoridade final de raster/Zoom, clique com screenshot do
WindowServer, feedback de Ghost Cursor via window-event, a renomeação do Helper e o guidance de autorização `PERMISSION_REQUIRED`,
além dos metadados de exibição da aplicação alvo do CUA 0.5.8; não deve regredir para nenhum dos SHAs de divergência.

## Objetivo

Depois que o CUA oficial entrega a imagem ao modelo, o modelo devolve apenas:

```json
{ "type": "coordinate", "x": 496, "y": 331 }
```

`x/y` são pixels inteiros da imagem que o modelo realmente recebeu. O modelo não escolhe Retina, DPI,
ponto lógico, pixel físico, crop, zoom, origem da janela ou sistema de coordenadas do monitor; todas essas diferenças são tratadas internamente por
`@zcode/zcode-cua` e pelo Helper.

Essa restrição define apenas o caminho "o modelo escolhe um ponto a partir da imagem". Quando o modelo usa diretamente o
`state_id/index` da árvore de acessibilidade, ele ainda pode passar um element target; element target não carrega coordenadas de imagem e também não pode ser
usado como codificação alternativa para a escolha de ponto na imagem. Os dois caminhos permanecem explicitamente distintos no schema público.

## Sequência entre processos

```text
Helper capture
    │ 原始 raster + capture/pointer/topology provenance
    ▼
zcode-cua 最终 crop/resize/encode
    │ 注册不可变内部 frame，并返回 image + image_ref + hint
    ▼
ZCode MCP bridge
    │ 官方 CUA 图像必须保持字节、尺寸、方向和 block 邻接关系
    ▼
模型 provider 请求
    │ 模型按收到的 raster 只选择整数 x/y
    ▼
zcode-cua transport 同步绑定当前 frame → registry → 像素中心投影
    → Helper 二次 provenance 校验 → 原生输入
```

Se qualquer camada não conseguir provar essa cadeia, a ação por coordenadas deve ser rejeitada; não se pode regredir para `screen`,
`normalized`, `state_image`, `screenshot` ou para a inferência da "imagem mais recente".

## Restrições da última milha

O MCP bridge genérico hoje executa omissão, artifactização ou compressão específica de origem em imagens que excedem o inline budget. Isso é razoável
para um MCP comum, mas quebra o contrato de coordenadas do raster oficial do CUA que já emitiu `frame_id`: a imagem que o modelo vê pode não ser mais a imagem apontada pelo descriptor.

Portanto o CUA oficial precisa de um gate de integridade próprio:

1. O raster precisa ser o primeiro bloco do tool result, com o bloco de texto `image_ref` logo em seguida; o bridge não pode colocar nenhum
   texto de diagnostic/hook antes do raster, nem reordenar ou separar esse par atômico.
2. O raster já foi codificado no zcode-cua com o orçamento de 190 KiB; a ZCode não pode redimensionar, cortar,
   rotacionar, recodificar nem substituir por texto de artifact.
3. Se o raster ainda exceder o limite explícito do provider, o resultado inteiro falha em fail-closed; não se pode apenas manter
   o `image_ref` e continuar permitindo ações para aquele frame.
4. Cada resultado permite apenas uma raster final; os image bytes dos blocos visíveis ao modelo devem permanecer exatamente como são,
   e MIME, largura e altura devem ser consistentes com o `image_ref`. O resumo de bytes usado internamente pelo producer para emissão de frame não estende o
   `image_ref` público; o bridge assume a prova de última milha por meio da invariância dos bytes originais e de uma verificação independente do raster header.
   O limite de verificação é declarado com honestidade: a verificação de bytes/formato acontece no MCP bridge (entrada) e no executor attestation
   (saída, fail-closed); a projeção do provider a jusante não revalida o attestation e, em vez disso, garante via
   regras estruturais genéricas de "texto com pareamento adjacente" (projeção de mídia adiada, orçamento de mídia, placeholder de compressão) que
   o `image_ref` e o raster chegam juntos ao modelo ou são removidos juntos.
5. Esse caminho especial só pode ser habilitado quando o official CUA authority gate não falsificável estiver satisfeito;
   um MCP de terceiros com o mesmo nome não obtém essa isenção.
   Internamente o Host usa apenas `modelContentProtection=official_cua_frame_v1` para representar essa autorização; não se deve manter
   um segundo boolean de preservação que precise ser configurado em sincronia. Toda mídia estruturada sem essa protection segue o orçamento genérico.
6. O hook `PostToolUse` só pode anexar texto limitado depois do par de mídia protegido; não pode substituir, reordenar,
   remover nem inserir conteúdo entre a imagem e o `image_ref`.
7. Quando qualquer verificação de referência, MIME, base64, cabeçalho de arquivo, dimensões, orçamento ou `frame_id` duplicado falhar,
   o bridge precisa remover atomicamente todas as imagens/image_ref de CUA do resultado e marcá-lo como erro;
   não se pode continuar enviando mídia incompleta ao modelo.
8. `structuredContent` não pode conter a autoridade de um `image_ref` JSON real — a autoridade pertence apenas ao content block colado ao raster,
   que é o que referencia a imagem que o modelo realmente recebeu. Quando o lado do producer derivar
   `structuredContent` (por exemplo, o texto AX usado por `nodeRepl.write(state.text)`), ele deve excluir o bloco de autoridade, caso contrário a mesma autoridade
   aparece em dois lugares e a regra 7 rejeitaria toda observação com screenshot.
9. A superfície de rejeição é dividida em dois caminhos e eles não podem ser fundidos: o modelo recebe apenas uma mensagem genérica de "tirar um novo
   screenshot" sem `frame_id` e sem caminho em disco (um frame rejeitado não pode virar uma autoridade utilizável); os critérios concretos ficam no `_meta` do
   resultado, em `zcode.cua/frame-integrity-rejections-v1`. O host `formatMcpToolResult` lê apenas uma chave de `_meta` específica e nunca serializa o `_meta` inteiro, então os critérios são diagnosticáveis sem entrar no contexto do modelo.
   Os critérios não podem existir apenas em variáveis locais da função: em 2026-09-11, em máquina real, a regra 8 foi violada e os critérios eram descartados logo após a rejeição, de modo que a falha de canal inteira "toda observação com screenshot é rejeitada pelo seu próprio gate" ficou silenciosa por um dia inteiro.

## Contrato de provenance do Helper

O Helper precisa declarar explicitamente `frame_pixel_projection_v1`, e o capture precisa retornar os campos autoritativos usados para construir o
FrameDescriptor: dimensões/crop do raster capturado, rect/unit do pointer, aplicativo
owner, window_id/bounds, identidade do display e fingerprint de topologia.

O RPC de ação carrega o point projetado junto com a provenance do momento da captura. Antes do input nativo, o Helper relê
o owner/window/display/topology atuais; em caso de inconsistência retorna `stale_frame` e
`actuated=false`. Helper antigo, campos ausentes, Wayland ou ambientes X11 onde não é possível provar um root grid 1:1
rejeitam apenas a coordenada de frame; o caminho element/AX permanece disponível.

## Aceitação

- As imagens pequenas do CUA oficial e as imagens próximas/acima do limiar genérico de 200 KiB mantêm o raster intacto;
- O `image_ref` adjacente e o bloco de imagem continuam adjacentes após passar pelo MCP bridge;
- MCP não oficial continua seguindo o orçamento genérico de inline/artifact;
- `returnedBytes` é o único agregado entre o texto visível ao modelo e o payload real do raster; não se pode expor nem depender de
  um segundo estado `mediaBytes`. O hook adicional soma ao agregado existente apenas os bytes UTF-8 realmente acrescentados;
- Quando faltam capability/provenance de capture, a ação por coordenadas tem zero actuation;
- macOS Retina, pixels físicos DPI-aware do Windows e o faixa comprovável do X11 no Linux têm
  evidência de marker-grid; Wayland e X11 ambíguo falham em fail-closed;
- `pnpm typecheck`, `pnpm lint` e os testes dos packages relacionados passam.
- O pin do producer precisa passar pelos gates de exportação do frame-contract e de existência da implementação, e a relação de merge com o baseline mínimo precisa estar registrada na provenance candidata; um número de versão consistente mas sem o contrato de pixels precisa ser julgado como packaging failure.