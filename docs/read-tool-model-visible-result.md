# Contrato do resultado visível ao modelo na ferramenta Read

## Contexto

O `tool_result` visível ao provider da ferramenta Read (incluindo `is_error` e o conteúdo de texto) é a única base para o modelo compreender o resultado da leitura. Este documento restringe a forma visível ao modelo do Read em casos de warning, leitura repetida, falha de preflight, leitura de imagem e leitura de texto comum; saída estruturada e tipos de erro internos estão fora do escopo desta consolidação.

## Objetivos

- Os warnings, dedups e erros de preflight visíveis ao modelo do Read usam textos e wrappers fixos e regressáveis.
- Manter a saída estruturada e os tipos de erro interno depuráveis; consolidar apenas a fronteira de texto visível ao modelo.

## Design

- O conteúdo visível ao modelo de `file_unchanged` é fixo como:
  `Wasted call — file unchanged since your last Read. Refer to that earlier tool_result instead.`
- O warning inline no tool result do Read usa uma linha única `<system-reminder>body</system-reminder>`. Este é um caminho exclusivo do mapper do Read e não substitui o `wrapSystemReminderForSource(...)` global.
- Ao ler texto não vazio com sucesso, o antigo malware reminder não é mais acrescentado; a saída contém apenas os reminders de freshness / truncation gerados conforme a condição e o corpo com números de linha.
- O tool result visível ao provider da leitura de imagem mantém apenas o image block. Os dados de conversão de tamanho e coordenadas gerados pelo resize da imagem continuam no output estruturado, mas nenhum text block adicional é gerado.
- Quando o preflight semântico do input do Read falha, o handler captura o custom issue de `ReadInputSchema.parse(...)` e lança um `ToolExecutionFailed` recuperável, com message `<tool_use_error>${issue.message}</tool_use_error>`.
- Erros que não são do Read ou que não são de validação semântica custom continuam pelo caminho genérico de validation existente, evitando envolver todos os erros de schema no formato `<tool_use_error>`.

## Aceitação

- `read-tool-contract.test.ts` cobre: texto de sucesso sem o antigo aviso de segurança, imagem contendo apenas media block, texto de dedup, wrapper de uma linha para warning do Read e o `<tool_use_error>` de preflight de binary/device.