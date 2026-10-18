# Spec de Suporte a Entrada de Vídeo (somente base64)

> Atualização do orçamento de requisição: o bucket de orçamento de vídeo isolado mencionado abaixo é
> uma solução histórica. Atualmente todas as mídias compartilham o orçamento de requisição de
> `40MiB` após codificação, e um vídeo individual continua sendo validado em `30MiB` do arquivo
> original; o que vale a
> [spec de orçamento de requisição de anexos](../../apps/zcode-cli/docs/design/v2/message-attachments.md#413-请求体防线).

- Data: 2026-08-17
- Status: fechamento da implementação da primeira fase (os pipelines existentes foram mantidos; esta
  rodada completa a capability efetiva do provider, o schema estrito, a mesclagem de catálogo, a
  leitura de limite na ferramenta Read, a persistência de mídia em tool result e as lacunas de
  observabilidade. A arquitetura de upload de vídeos grandes para Web/mobile não é ajustada nesta
  rodada)
- Branch: `feat/video-input-support`
- Escopo: entrada de vídeo (sem áudio); dois cenários: anexo da caixa de entrada e ferramenta Read
- Notas de implementação:
  - Os dois patches ficam na **raiz** `patches/` (`pnpm.patchedDependencies` do package.json da raiz) —
    na prática o runtime da CLI resolve `@ai-sdk/*` a partir do node_modules da raiz
    (`node-linker=hoisted`); o node_modules/.pnpm do próprio apps/zcode-cli é um artefato legado
  - O upload no V4 continua usando os limites existentes de 20MiB, 64 chunks e 64MiB de staging; esta
    fase não amplia os limites de recursos do protocolo para vídeos grandes em Web/mobile
  - image/video já enviados reutilizam o mesmo Dialog de preview de mídia; o upload no V4 continua em
    20MiB, e o preview read é limitado por tipo de mídia em image 20MiB e video 30MiB, com cada
    quadro continuing abaixo de 512KiB
  - Após o commit do patch é preciso rodar `pnpm install` explicitamente para que ele seja aplicado ao
    diretório hoisted

## 1. Contexto e Conclusões da Pesquisa

### 1.1 Hoje a entrada de mídia tem apenas o pipeline de image

A entrada de mídia existente tem apenas o **pipeline de image base64**: ler arquivo local → resize /
orçamento de bytes → `{type:"image", source:{type:"base64", media_type, data}}`. Não existe caminho de
construção de content block de video/audio. Esta spec estende o padrão para vídeo.

### 1.2 Verificação de fatos do formato wire

| Formato                   | Forma no wire                                                                           | Origem e fato                                                                                                                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| openai-chat-completions   | `{"type":"video_url","video_url":{"url":"data:video/mp4;base64,..."}}`                  | Formato da documentação oficial de GLM-5V-Turbo / Kimi K3; esta implementação envia apenas data URL em base64                                                                                                                                   |
| anthropic-messages        | `{"type":"video","source":{"type":"base64","media_type":"video/mp4","data":"..."}}`     | **A Messages API oficial da Anthropic hoje não tem block de video** (no lado de entrada só há image/document). Esta forma é isomórfica ao block de image (`type`/`media_type`/`data`) e é o formato consensual do ecossistema de camadas de compatibilidade no estilo Anthropic; se cada endpoint anthropic compatível de terceiros aceita fica a cargo da verificação prática |

A aceitação pelo endpoint não pode ser decidida apenas pelo `supportsVideo` do catálogo de modelos: a
capacidade do modelo significa "o modelo semanticamente consegue receber video", e a capacidade wire
do provider significa "o adapter atual consegue codificar video numa requisição legal para a API de
destino". A capability efetiva em runtime é a interseção das duas; quando qualquer camada declara
suporte explícito ausente, vale o mecanismo de placeholder por strip já existente, e a requisição não
falha.

### 1.3 Bloqueio do AI SDK

- `@ai-sdk/anthropic@3.0.81`: a file part só aceita `image/*`, `application/pdf` e `text/plain`; para os
  demais mediaType ele faz `throw UnsupportedFunctionalityError` direto.
- `@ai-sdk/openai-compatible@2.0.60`: não tem ramo de video (também faz throw).
- Solução: um `pnpm patch` em cada um dos dois pacotes adicionando um ramo `video/*` (o repositório já
  tem o precedente `patches/vitest@4.1.7.patch`).

### 1.4 Situação atual do protocolo zcode (antes da integração)

- Todo o julgamento de image na cadeia é um `mime.startsWith("image/")` exato ou uma extensão de imagem; o
  vídeo não casa com nenhum ramo de image: a serialize da UI cai em `kind:"file"`, o mapeamento de
  ref da CLI cai em `type:"file"`, o core cai no caminho de referência `binary_file` e o Read cai no
  erro vago de `looksLikeBinary`. **O vídeo não pode se pendurar no canal de image; é preciso abrir um
  canal novo.**
- O enum `ModelProviderModality` e o zod de storage já contêm `"video"`; no snapshot models-dev,
  `glm-5v-turbo` já declara `video` em `modalities.input`. O que falta é apenas o conjunto de projeção
  (`PROTOCOL_MEDIA_INPUT_MODALITIES`) e os campos de capability a jusante.

## 2. Arquitetura

### 2.1 Fluxo de dados

```
场景A 输入框附件                          场景B Read 工具
[拖拽/粘贴 .mp4]                          Read(file.mp4)
  │ 桌面: localPath 零拷贝                   │ inferVideoMimeFromPath
  │ Web: dataBase64（沿用 V4 20MiB 上限）    │ readBinaryFile(≤全局30MiB, 无压缩)
  ▼                                          ▼
ZCodePromptVideoAttachment{kind:"video"}   ReadVideoOutput{type:"video"}
  ▼ mapProtocolPromptAttachment /            │ formatReadVideoOutput
    attachment-refs(isVideoRef)              ▼
TurnAttachment{type:"video"} ──────► ModelVideoContentBlock{type:"video",
  ▼ resolveLocalFileAttachment/inline          mediaType, dataUrl,
  30MiB校验→读base64→artifact持久化            source}
  ▼                                            ▼
user message content ◄──────────── tool-result-media-projection
  │                                        (video 的 tool result 媒体统一拆
  ▼                                         后置 user part，所有 provider kind
transform.ts: video block → AI SDK file part{mediaType:"video/mp4", data: base64}
  │                                          一致；image 维持 image-data 路径)
  ├─ openai-compatible(patch) → {type:"video_url",
  │    video_url:{url:"data:video/mp4;base64,..."}}
  └─ anthropic(patch)        → {type:"video", source:{type:"base64",
                                media_type:"video/mp4", data}}
```

### 2.2 Tipos internos (provider-neutral, isomórficos ao de image)

```ts
interface ModelVideoContentBlock {
  type: "video"; // 不叫 "video_url"——那是 openai wire 方言
  mediaType: string; // "video/mp4" 等
  dataUrl: string; // data:video/mp4;base64,...（唯一内容形态）
  source?: AttachmentRef;
}
```

### 2.3 Capacidade do modelo e capacidade wire do provider

```text
模型目录 supportsVideo
          │
          ├── false ──────────────────────────────► strip 占位
          │
          └── true / unknown
                    │
                    ▼
          provider adapter wire capability
                    │
                    ├── unsupported ──────────────► effective false → strip 占位
                    └── supported / 未明确限制 ──► 进入既有 video transform
```

- `openai-compatible` usa o wire de Chat Completions e depende do patch do repositório para emitir
  `video_url`; é um caminho suportado na primeira fase.
- O provider compatível `anthropic` depende do patch do repositório para emitir o block `video`
  convencionado pelo endpoint compatível, e ainda precisa ser verificado na prática por endpoint.
- `providerKind: "openai"` hoje vai pelo AI SDK OpenAI Responses; esse adapter rejeita file part
  `video/*` antes de enviar a requisição, então a primeira fase o marca explicitamente como wire
  unsupported e ele não entra no transform de vídeo.
- `gateway` / `custom` não têm fatos suficientes que provem suporte ausente uniforme; esta rodada não
  adiciona bloqueio especulativo.

### 2.4 Persistência provider-neutral e troca de modelo

O DB da sessão guarda apenas fatos de mídia reconstruíveis entre providers: o MIME, nome de arquivo,
tamanho/digest e outros metadata do `FilePart`, além do URI `zcode-artifact://` apontando para o
snapshot completo da mídia. O wire em base64 não é fato de mensagem e só pode ser gerado na
projeção da requisição atual.

```text
live tool/user media
        │ snapshot
        ▼
session DB: FilePart ───────► artifact store: immutable source media
        │                                      │
        │ hydrate / model switch               └─ read ─► data URL / base64
        ▼
current-provider request projection
```

- Anexos do usuário continuam usando o `file` part da user message; mídia produzida por ferramentas usa
  `ToolStateCompleted.attachments`; ambos apontam para a mesma fonte de fato de artifact.
- A troca de modelo dentro da conversa e a recuperação reidrata o block provider-neutral primeiro
  e só então projetam pelo provider atual; não se pode reutilizar o wire payload do provider anterior
  como fato histórico.
- Se o conteúdo provider-visible de um tool result for composto de text e blocks de image/video/file
  baseados em data, a mídia é escrita em `attachments` na ordem, e um `modelContentLayout` pequeno,
  contendo apenas índices de text/attachment, é salvo nos metadata de completed; na recuperação, a
  ordem original é reconstruída a partir dele. Ele cobre apenas as formas realmente existentes de mídia
  pura, MCP text/media e hook text/media, e não introduz uma camada genérica de serialização de
  mensagens.
- Quando a escrita do artifact falha, não se pode rebaixar silenciosamente a mídia bem-sucedida para um
  histórico apenas com metadata, senão trocas/recuperações seguintes não conseguiriam reconstruí-la;
  o turn atual deve falhar explicitamente e a tool call é fechada pela semântica existente de
  recuperação de tool interrompida.
- O vídeo real do usuário e a imagem compartilham a projeção de path local request-local: local-file
  reaproveita o absolute path acessível pelo runtime atual, e o artifact inline é materializado de forma
  lazy em `cli/video-cache/<sessionId>` antes da requisição. Com capability `true`/`undefined` envia-se
  video block + path; com `false` explícito envia-se texto omitted + path; o path não é gravado no
  session DB e, na recuperação a frio, ele é re-assegurado a partir do artifact durável como fato.

### 2.5 Preview de mídia antes do envio e já enviado

Antes do envio e para anexos já enviados, reaproveita-se `ChatMediaAttachmentPreviewDialog`, tratando
apenas image/video como mídia previewável. O preview é uma exibição best-effort do renderer e não
altera a semântica de upload, envio, persistência ou entrada do provider:

```text
Composer File/object URL ────────────────┐
                                         ├─> shared media dialog
sent user row + attachment index         │      ├─ image: existing preview
        │                                │      └─ video: controls + playsInline
        ▼                                │                 │
CLI authorizes row/entity/ref            │                 ├─ loadedmetadata -> player
        │                                │                 └─ error -> codec/format notice
        ├─ message anchor not persisted ─┼─ authorized original stable ref
        ▼                                │
persisted user FilePart                  │
        ├─ durable artifact exists
        │      ├─ Desktop local -> .zcode video-cache path ─┐
        │      └─ remote/web or path unavailable -> chunked artifact read
        └─ no artifact
               ├─ Desktop local_ref -> authorized local path ─┤
               └─ remote/web -> chunked stable-ref read
                                                            ▼
                                        Host asks Main to authorize realpath
                                                            │
                                                            ▼
                                      exact authorized path -> media protocol
```

- Todos os MIME `video/*` já suportados podem entrar no `<video>` nativo; não se deve manter uma
  allowlist de container/MIME que mate antecipadamente casos válidos; quando o navegador não decodifica
  MOV ou um codec específico, exibe-se um texto explícito de "preview não suportado neste
  dispositivo", mas o anexo continua podendo ser enviado normalmente.
- A query de anexos já enviados precisa autorizar pela identidade estável da user row e pelo índice do
  anexo, e então ler preferencialmente o `FilePart.metadata.artifactUri` (ou a URL do artifact)
  persistido naquele round. Isso garante que o estado quente, a recuperação a frio e vários envios pelo
  mesmo caminho sempre pré-visualizem a mídia imutável que foi gravada no banco; no estado quente, o
  original ref e o previewRef pós-hydrate passam pela autorização desde que pertençam à mesma row/index.
  Só se lê o ref original já autorizado quando a nova mensagem ainda não tem uma âncora de message
  persistida, ou quando o histórico antigo não tem artifact durável. Uma falha de leitura isolada só
  mostra o erro no Dialog atual e, ao fechá-lo, ainda é possível abrir de novo e tentar novamente.
- O upload V4 e a leitura de preview de image continuam tendo 20MiB como teto total. O sent-video local
  no Desktop pede primeiro a local source autorizada: o path derivado de `.zcode` correspondente ao
  artifact tem prioridade, e só depois entra o `metadata_only/local_ref` sem artifact; o player local
  não faz full read, portanto não é sujeito ao limite `VIDEO_INPUT_MAX_BYTES = 30MiB`, nem copia
  novamente o arquivo para um local-ref acima do limite. Quando o artifact existe mas o path derivado
  não está disponível, só é possível ir pelo artifact no caminho de leitura de 512KiB já existente;
  não se pode voltar ao path original.
- Web, o `web-remote-replayable` do celular e workspaces SSH/WSL/Docker não recebem path do servidor e
  mantêm a consulta fragmentada existente do attached host, o teto de preview de 30MiB e a semântica de
  cancelamento. O main do Desktop só oferece o mapeamento do protocolo de mídia local com Range, não
  guarda estado de session/task/replay e não inicia outro runtime. Depois que o Agent autoriza por
  row/index e escolhe o path local, o Host precisa primeiro pedir ao Main que inclua o `realpath` dele
  no conjunto de caminhos exatos do ciclo de vida do processo, e o renderer só pode reproduzir aquele
  canonical path; o protocolo de mídia não pode liberar acesso só porque a URL carrega um absolute path
  arbitrário ou declara `video/*`. Falha na autorização do path exibe diretamente o erro de preview já
  existente, sem fallback para a leitura fragmentada.

## 3. Projeção da Requisição ao Provider (somente base64)

- `ModelVideoContentBlock` só carrega `dataUrl`; nem o contract nem o JSON Schema estrito oferecem
  campos de URL/file-id.
- O patch openai-compatible sempre codifica os bytes de vídeo como data URL em base64 dentro de
  `video_url.url`.
- O patch anthropic sempre codifica os bytes de vídeo como `source:{type:"base64"}`.
- A Files API do provider, a referência por URL, o cache de upload e as estratégias de invalidação não
  fazem parte do design atual; se a necessidade voltar a existir no futuro, será preciso atualizar
  esta spec e os testes de recuperação entre providers antes de implementar.

## 4. Decisões-Chave

| Decisão                     | Conclusão                                                                                    | Base                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Forma do conteúdo          | Primeira fase somente base64 (dataUrl)                                                        | Decisão do usuário; isomórfica ao pipeline de image existente; sem dependência de infraestrutura de upload |
| Teto de vídeo              | 30MiB fixo global do ZCode, fora das capacidades de catálogo/sessão de modelo                   | Consistente com image: o modelo só declara se suporta a modalidade; a política de produto restringe uniformemente o tamanho de entrada |
| Transporte Web/mobile      | Reaproveitar o teto existente de 20MiB para anexos no V4                                      | A solução de transporte de vídeos grandes não é tratada agora; não se ampliam as fronteiras de recursos de chunk/staging |
| Cobertura wire             | Formato duplo openai `video_url` + block `video` do anthropic, camada de conversão genérica por apiFormat, sem especialização por endpoint | Decisão do usuário                                            |
| Exclusão mútua de modalidades | Não tratada na primeira fase (o GLM declara explicitamente não suportar entender arquivo, vídeo e imagem simultaneamente); erro do gateway para anexos mistos é repassado | Decisão do usuário                            |
| Áudio                      | Fora do escopo desta fase                                                                      | Decisão do usuário                                                                 |
| Vídeo em tool result       | Todos os provider kinds quebram de forma uniforme em um user part posicionado depois (reaproveitando tool-result-media-projection) | A tool result part do AI SDK não tem variante de vídeo; superfície de patch mínima |
| Orçamento                   | Bucket separado de vídeo (30MiB por padrão); o bucket de 4MB de image não muda                | O bucket de 4MB não comporta vídeo e mesclar direto atingiria imagens           |

## 5. Lista de Implementação (Resumo das Fases 1-4)

### Fase 1: Tipos e Cadeia de Capability

- contracts: `ModelVideoContentBlock` + union + projeção de texto; `media-policy` com `supportsVideo` e
  a constante global de teto de entrada de vídeo; `ModelProperties`/`ModelCapability` com
  `supportsVideo`; `ReadVideoOutput` + schema + `READ_VIDEO_MAX_INPUT_BYTES`
- shared: `PROTOCOL_MEDIA_INPUT_MODALITIES` com video + projeção `supportsVideo` + campo no schema zod;
  `ZCodePromptVideoAttachment`; o V4 continua usando a fronteira de upload existente de 20MiB
- core: `TurnAttachment.type` ganha `"video"`

### Fase 2: Cadeia do core

- ramo de video em `attachments.ts` (validação de 30MiB, sem compressão, persistência em artifact,
  degradação para referência de path quando acima do limite); extensões de vídeo em
  `inferAttachmentMimeFromPath`; append em `conversation.ts`; strip em `media-capability`;
  bucketing de vídeo em `media-budget`; replay do hydrator; `read-video.ts` + atualização do prompt do
  Read; passagem em runtime methods; bootstrap `mapProtocolPromptAttachment`/`attachment-refs` com ramo
  de vídeo; `VIDEO_EXTENSIONS` em `prompt-command.ts`

### Fase 3: Adapter + patch duplo

- patch de `@ai-sdk/openai-compatible`: file part com `video/*` → `video_url`
- patch de `@ai-sdk/anthropic`: file part com `video/*` → block `video` (isomórfico ao ramo de image)
- caso de video em `transform.ts` (degradação de user/assistant); user part posicionado depois em
  `tool-result-media-projection`; validação em `model.ts`; passagem em
  `runner-options`/`registry`; derivação de modality em `models-dev.ts`
- capability efetiva do adapter: interseção entre a declaração do modelo e a capacidade wire do
  provider; OpenAI Responses degradado explicitamente para não suportado

### Fechamento da implementação (nesta rodada)

- O JSON Schema estrito aceita `ModelVideoContentBlock` e continua rejeitando campos desconhecidos.
- A mesclagem de override de catálogo/provider é preservada e permite sobrescrever `supportsVideo`.
- `FileSystemPort.readBinaryFile(maxBytes)` continua limitado mesmo na fase real de leitura, evitando
  que o crescimento do arquivo entre o stat e o read contorne o limite; o anexo de vídeo local
  reaproveita essa entrada.
- `readBinaryFile(maxBytes)` só considera EOF quando lê `0` bytes; uma leitura curta continua da
  posição atual, evitando truncar mídia legítima e reportar sucesso por engano.
- O Read devolve um erro estável para vídeo de zero bytes, sem gerar a mídia vazia que o adapter
  descartaria em seguida.
- O vídeo inline só aceita data URL base64 estrita com MIME `video/*`; sem marcador de base64, com
  corpo inválido ou com MIME divergente, tudo é convertido em `attachment_video_invalid`, sem cair no
  ramo genérico de anexo de texto.
- Resultados de Read/tool com mídia pura fazem snapshot do block completo baseado em data para o
  artifact e guardam a referência em `attachments` do completed tool part; a recuperação a frio
  reprojeta pelo modelo/provider atual.
- A capability de mídia e o resumo de E/S do modelo passam a contar vídeo, sem mudar o resultado da
  projeção de mensagem.
- As fronteiras de entrega shared-host, `replayable`/`continuous` de Web/mobile e o teto existente de
  upload V4 de 20MiB permanecem iguais; o vídeo inline no Web devolve um erro estruturado de
  excedente por esse teto antes da codificação base64; não entra nenhum novo canal de upload,
  expansão de chunk/staging ou runtime dedicado.

### Fase 4: UI

- `chatAttachments.ts`: inferência de mime + ramo de serialize de vídeo (path local do desktop 30MiB;
  inline no Web sujeito ao teto V4 de 20MiB)
- composer e image/video já enviados reutilizam o Dialog de preview de mídia; o vídeo usa controls/
  playsInline nativos, e falha de carregamento ou decodificação só muda o aviso de preview; anexos já
  enviados preferem ler o artifact persistido; i18n; dois temas

## 6. Testes e Verificação

- Testes unitários primeiro: `model-transform.test.ts` (caso/strip/unsupported de vídeo),
  `model-transform-tool-media.test.ts` (user part posicionado depois de vídeo, nos dois providerKind),
  novo `video-wire.test.ts` (fetch mock assertando as duas formas de wire em base64),
  `prompt-attachments.test.ts` (resolve/degradação), `media-budget.test.ts` (bucketing), ferramenta
  read, `chatAttachments.test.ts` (serialize/restore), leitura curta de filesystem, cold recovery de
  mídia de completed tool
- `media-capability.test.ts`, os testes de artifact-store e de bootstrap persistence fixam o
  comportamento de image inalterado e cobrem o vídeo do usuário preservando o request-local path sob
  `true`, `undefined` e `false`, além da reconstrução a frio do vídeo inline
- `pnpm typecheck` + `pnpm lint` obrigatórios
- E2E manual: arrastar mp4 no desktop → GLM-5V-Turbo (endpoint openai + um endpoint compatível com
  anthropic); Read de mp4; replay de histórico; vídeo pequeno no Web
- e2e: primeiro fixar no case catalog/matrix de conversation as combinações representativas de
  switch/cold-resume de vídeo no composer e no Read; os specs pending específicos são escritos após a
  confirmação da poda e usam fixture case-local.

## 7. Tabela de Riscos

| Risco                                         | Descrição                                                             | Mitigação                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Aceitação de vídeo por endpoints compatíveis com anthropic | A API oficial da Anthropic não tem block de vídeo; se a forma consensual é aceita por cada endpoint não está documentado | Camada de conversão genérica; o `supportsVideo` converge após verificação prática; quando não suportado, placeholder por strip |
| Corpo de requisição base64 de 30MiB (dataUrl com cerca de 40MiB) | Pode bater no limite de entrada por campo do gateway (lição semelhante em ZCT-2085774) | Verificação prática; se for preciso ajustar, atualizar primeiro a política global de produto e esta spec; upload por streaming/referência exige design separado |
| Transporte de vídeo grande no Web             | O teto de transação de upload existente do V4 é 20MiB e não comporta o teto global de entrada de vídeo de 30MiB | Não ampliar as fronteiras de recursos do protocolo nesta fase; se for necessário suportar, atualizar a spec e desenhar uma solução de transporte à parte |
| Custo de manutenção dos dois patches           | Atualizar os pacotes do AI SDK exige reaplicar os patches             | O §3 desta spec + o diretório `patches/` registram o conteúdo dos patches                      |
| Exclusão mútua de modalidades não tratada     | Erro do gateway para anexos mistos é repassado                        | Texto de erro repassado (confirmado pelo usuário)                                              |
| OpenAI Responses não aceita file part de vídeo | O AI SDK lança unsupported antes da requisição de rede, e a capability do catálogo não representa a capability wire | Degradação explícita da capability efetiva; não afeta o caminho `openai-compatible` de Chat Completions |