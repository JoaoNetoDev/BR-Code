# Allowlist de MIME de recursos comuns do MCP Apps

## Objetivo e limites

Quando a página de um plugin lê arquivos comuns como PDF via `resources/read`, a allowlist existente rejeita conteúdo legítimo antes de devolver a página. Desta vez são estendidos itens explícitos da allowlist compartilhada, preservando as regras de correspondência e os limites de recurso atuais; não são usados novos prefixos de grandes categorias como `application/`, `image/`.

A única fonte de regras é `packages/shared/src/mcp-apps/resourceMime.ts`, continuando a ser exportada por `contract.ts` com as interfaces originais como `MCP_APPS_UI_READ_RESOURCE_MIME_ALLOWLIST`. A lista é mantida em arquivo separado para preservar o limite de linhas do contrato principal. O Agent realiza a verificação de execução do mcp-ui; a ponte de serviço e a página do plugin não criam allowlists próprias.

```text
página do plugin → verificação de credenciais da instância e de pertencimento ao servidor → MCP resources/read
         → verificação de allowlist de MIME e de total de 8 MiB → remoção de _meta → retorno à página
```

## Escopo de aceitação

| Categoria       | Formatos comuns aceitos                                 |
| -------------- | -------------------------------------------------------- |
| Tipos já existentes | `text/*`, JSON, PNG, JPEG, WebP, GLB, binário genérico |
| Documentos      | PDF, RTF, DOC/XLS/PPT, DOCX/XLSX/PPTX, ODT/ODS/ODP       |
| Dados estruturados | XML, YAML (incluindo `application/x-yaml`)            |
| Imagens         | SVG, GIF, AVIF, BMP, TIFF, ICO, HEIC, HEIF               |
| Áudio           | MP3, áudio MP4, Ogg, WAV, áudio WebM, AAC, FLAC           |
| Vídeo           | MP4, WebM, Ogg, QuickTime, MPEG                          |
| Arquivos        | ZIP, GZIP, TAR, 7z, RAR                                  |
| Fontes e modelos | WOFF, WOFF2, TTF, OTF, glTF em JSON                     |

O MIME ignora maiúsculas/minúsculas, espaços no início e no fim e parâmetros após ponto e vírgula; fora disso a correspondência é exata. O comportamento existente do prefixo `text/` é preservado. Os aliases de MIME comuns de WAV, GZIP e ICO são listados explicitamente, sem inferir extensões arbitrárias ou tipos de fabricante.

## Permanece inalterado

- MIME não listados, MIME vazio e blobs sem MIME continuam rejeitados; tipos executáveis explicitamente declarados como `application/x-msdownload` não são liberados.
- A cada chamada o resultado é acumulado pelo texto UTF-8 e pelos bytes decodificados em base64 de todos os itens de conteúdo, até no máximo 8 MiB; ao exceder, a chamada inteira é rejeitada, sem truncamento.
- Preservam-se as verificações existentes de credenciais da instância, pertencimento ao servidor, instância inválida, sandbox, CSP e confirmação de salvamento de download.
- Apenas o recurso é transmitido, sem garantia de que o host ou o plugin tenha decodificador para o formato correspondente; o `_meta` do recurso não é repassado à página.
- Não modifica interface, botão de recarregar, handshake ou ciclo de vida. Não altera a semântica de desktop continuous nem de mobile replayable; quando Web/remoto não estiver disponível, os limites de capacidade existentes continuam válidos.

## Verificação de regressão

- Contrato compartilhado: aceitação das categorias comuns; compatibilidade de maiúsculas/minúsculas e parâmetros; rejeição de tipos desconhecidos, sufixos falsificados e tipos executáveis.
- Handler do Agent: blob de PDF e texto SVG devolvidos como estão e com `_meta` removido; tamanho total, MIME ausente e pertencimento ao servidor continuam vigentes.
- Integração Electron: um iframe real de plugin lê PDF/SVG via App SDK, host, Agent e processo MCP, conferindo MIME e bytes; após a falha por tipo desconhecido, a página ainda consegue ler recursos legítimos.
- Validação da cadeia Electron controlada com o já existente `mcp-apps-host-e2e.mjs --managed-only`, sem apresentar esse resultado como regressão completa de todas as plataformas de desktop ou do Web no celular.