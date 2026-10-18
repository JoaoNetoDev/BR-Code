# Orçamento de Saída de Ferramentas MCP

## Contexto

O servidor MCP é uma fonte de entrada externa, e o resultado da ferramenta não pode ter seu volume presumido por padrão. Antes, imagens MCP eram convertidas em blocos de imagem inline visíveis ao modelo; `resultBudget` contava apenas o texto de placeholder via `modelMessageContentToText`, o que fazia com que imagens base64 grandes não fossem truncadas na camada de resultado da ferramenta. Embora a requisição ao modelo principal ainda tenha um media budget de 4 MiB, um único screenshot MCP de cerca de 2 MiB ainda pode exceder o limite de HTTP body do provider/proxy e disparar 413.

## Objetivos

- Resultados de texto MCP continuam sujeitos ao `resultBudget`.
- Imagens base64 comuns de MCP de terceiros que excedam 200 KiB deixam de ser embutidas inline na requisição ao modelo.
- O `node_repl/js` mantido é a ferramenta hospedeira confiável de browser use; quando sua imagem via `nodeRepl.emitImage(...)` excede
  200 KiB, ela é primeiro comprimida até o orçamento e, se tiver sucesso, continua entrando no modelo como bloco de imagem, em vez de simplesmente perder a capacidade visual.
- Imagens MCP fora do limite que não podem ser comprimidas têm uma cópia local salva como artifact; o modelo recebe apenas o path/URI do artifact e a descrição de dimensões.
- Sem artifact store, uma imagem fora do limite também não pode continuar embutida inline — deve degradar para uma descrição em texto.
- A semântica de session/task do desktop `desktop-continuous` e do mobile `web-remote-replayable` permanece inalterada; isto é uma projeção de resultado de ferramenta dentro do agent runtime e não muda owner, queue ou limites de snapshot do controle remoto.

## Design

O handler da ferramenta MCP normaliza o resultado imediatamente após chamar `McpPort.callTool`, em vez de esperar por `formatModelContent`. A razão é que o handler possui `artifactStore`, `sessionId`, `turnId` e `toolCallId`, podendo salvar uma cópia; `formatModelContent` tem apenas a saída e não consegue persistir em disco.

Regras de normalização:

1. Com `type: "image"` e `data` / `mimeType` válidos, calcula o número de bytes UTF-8 do payload base64.
2. Quando o payload não excede `200 * 1024` bytes, mantém inline, preservando compatibilidade com imagens pequenas e a capacidade visual atual.
3. Para imagens hospedeiras com `serverName=node_repl && toolName=js`, chama primeiro `ImageProcessorPort.prepareForModel`:
   - o limite do payload base64 é fixo em `200 * 1024` bytes;
   - o limite do binário decodificado é fixo em `floor(200 * 1024 * 3 / 4) = 153600` bytes, garantindo que o base64 re-codificado não ultrapasse o limite;
   - o limite da borda mais longa é 2000, consistente com o tamanho legível das imagens do modelo no `Read` existente;
   - reaproveita a sequência de candidatos já existente no adapter: preservação de formato/otimização PNG, redução na borda 2000, escada de qualidade JPEG, quantização PNG, redução progressiva e, por último, o fallback de JPEG de baixa qualidade em tamanho pequeno; é proibido adicionar outro conjunto de codecs na ponte MCP.
4. Depois que a compressão da imagem hospedeira tem sucesso, é preciso validar novamente pelos bytes base64 reais que o resultado é `<= 200 KiB`, entregando ao modelo apenas o `data` / `mimeType` transformado como bloco de imagem; a imagem original não entra na requisição ao provider.
5. Imagens MCP comuns de terceiros não passam por compressão intensiva de CPU e entram diretamente na estratégia de artifact, evitando transformar payload MCP não confiável em uma superfície genérica de ataque por decodificação de imagem.
6. Quando a imagem hospedeira não tem `ImageProcessorPort`, quando a decodificação/compressão falha ou quando a revalidação defensiva ainda excede o orçamento, ela também entra na degradação de artifact já existente na ferramenta. Prefere-se usar `writeToolResultBinaryArtifact` para salvar o binário decodificado e escolher a extensão `.png` / `.jpg` / `.gif` / `.webp` conforme o `mimeType`; o modelo vê apenas o path/URI local.
7. O bloco de content visível ao modelo é substituído por texto: informando que a imagem MCP foi salva, o path/URI local, o tamanho original e o limiar.
8. Se o artifact store atual ainda não suportar escrita binária, há fallback para artifact de texto: o JSON contém
   `dataUrl`, `mimeType`, os nomes de server/tool, o número de bytes base64 original e o horário de geração.
9. Se o artifact store estiver indisponível, substitui-se por uma descrição em texto deixando explícito que nenhuma cópia foi salva, evitando continuar enviando base64 grande.

### Combinações de origem e estado

| Origem         |  base64 original | ImageProcessor     | Resultado                              | Estado     |
| -------------- | ---------------: | ------------------ | -------------------------------------- | ---------- |
| `node_repl/js` | `<= 200 KiB`     | qualquer           | imagem original inline                 | accepted |
| `node_repl/js` |  `> 200 KiB`     | comprimida no orçamento | imagem comprimida inline            | accepted |
| `node_repl/js` |  `> 200 KiB`     | ausente/falha/revalidação excede | artifact da imagem original ou degradação em texto sem store | accepted |
| outro MCP      | `<= 200 KiB`     | qualquer           | imagem original inline                 | accepted |
| outro MCP      |  `> 200 KiB`     | qualquer           | artifact da imagem original ou degradação em texto sem store | accepted |

Esta mudança ocorre apenas na fase de projeção do resultado da ferramenta do agente, não adiciona campos de protocolo, não altera estado de session/task e não distingue `desktop-continuous` de `web-remote-replayable`: as duas pontas compartilham o mesmo resultado de ferramenta orçado.

## Verificação

- Imagens MCP pequenas ainda são projetadas como bloco de imagem.
- Imagens MCP grandes são substituídas por texto, salvando os bytes de imagem decodificados quando há artifact store com suporte binário, e retornando o path/URI da imagem.
- PNG/JPEG fora do limite de `node_repl/js` são comprimidos para um bloco de imagem com base64 de no máximo 200 KiB quando `ImageProcessorPort` está disponível, sem gravar artifact.
- Quando a compressão da imagem hospedeira falha ou o resultado comprimido ainda ultrapassa o limite, ela não é embutida e a imagem original continua sendo salva como artifact.
- O adapter Jimp real respeita os dois orçamentos — borda mais longa 2000 e base64 de 200 KiB — para screenshots de página longa.
- O artifact store antigo ainda faz fallback para artifact JSON, sem o base64 original na requisição ao modelo.
- Sem artifact store, imagens grandes ainda são substituídas por texto e não entram na requisição ao modelo.
- Executar os testes unitários relacionados à ponte MCP e ao runtime tool loop.
- Executar `pnpm typecheck` e `pnpm lint`.
