# Artefatos de Casos E2E com Falha e Upload para a Plataforma de Relatórios

## Objetivo

Após a conclusão da execução E2E de desktop, enviar o `summary.json` e o `summary.md` de toda a execução para a plataforma de relatórios E2E do ZCode; os vídeos de janela dos casos com falha são enviados em complemento, um a um, pelo título do caso, depois que a criação do relatório é concluída com sucesso. O GitLab CI continua salvando os artefatos binários, enquanto a plataforma de relatórios salva o resumo estruturado e os vídeos que podem ser baixados sob demanda.

Esse recurso é habilitado explicitamente por `ZCODE_E2E_FAILURE_ARTIFACTS=1` para a coleta de logs e vídeos dos casos com falha; por padrão, `pnpm test:e2e` não gera vídeo nem log por caso, evitando que a regressão diária aumente o uso de disco e CPU. Os jobs macOS e Windows do GitLab responsáveis pelo upload do relatório no repositório devem definir explicitamente esse valor como `"1"` nas `variables` do job, e não podem depender de variáveis externas de nível de projeto.

## Contrato dos Artefatos

Cada tentativa com falha grava:

```text
packages/desktop/.e2e-artifacts/<run-id>/
  summary.json
  summary.md
  runtime-logs/<worker-id>/{desktop,agent}/...
  failures/<worker-id>/<case-id>/attempt-<retry-index>/
    case.json
    logs/index.json
    logs/<runtime-log-relative-path>
    video.webm
```

- `worker-id` é o `cid` do WebdriverIO; `case-id` é um hash estável do `fullTitle`; `retry-index` preserva cada repetição, evitando que artefatos locais sejam sobrescritos.
- `case.json` registra o título completo do caso com falha e o caminho relativo do vídeo. O uploader lê apenas manifestos com `version: 1` e `result.passed: false`.
- Os logs registram, em `beforeTest`, o byte offset de cada arquivo de runtime log, e, no `afterTest` de falha, copiam apenas os bytes novos. Os diretórios de log desktop/agent de cada worker são isolados, portanto os logs de outros workers não são misturados ao caso atual.
- O vídeo usa `webContents.capturePage()` do Electron, e o ffmpeg só é chamado para codificar quando há falha. A coleta do artefato de falha, por padrão, captura 2 segundos antes do início do corpo do teste e mais 2 segundos após a falha, completando toda a linha do tempo pelo relógio de parede real. O padrão é 4 FPS, ajustável por `ZCODE_E2E_FAILURE_VIDEO_FRAME_INTERVAL_MS`, `ZCODE_E2E_FAILURE_VIDEO_PRE_ROLL_MS` e `ZCODE_E2E_FAILURE_VIDEO_TAIL_MS`.
- A cadeia de diagnóstico precisa ter limites: a captura de um único quadro espera no máximo 5 segundos por padrão, o ffmpeg espera no máximo 30 segundos, o `stop()` da gravação tem um orçamento total padrão de 45 segundos e toda a coleta de artefatos de falha no `afterTest` tem um orçamento total padrão de 60 segundos. Ajustáveis respectivamente por `ZCODE_E2E_FAILURE_VIDEO_CAPTURE_TIMEOUT_MS`, `ZCODE_E2E_FAILURE_VIDEO_ENCODE_TIMEOUT_MS`, `ZCODE_E2E_FAILURE_VIDEO_STOP_TIMEOUT_MS` e `ZCODE_E2E_FAILURE_ARTIFACT_COLLECTION_TIMEOUT_MS`. Os timeouts só são registrados no resultado do teste ou em `collectionErrors` no `case.json`, e não podem sobrescrever o resultado original do teste nem bloquear o `after`, o `afterSession` e a geração do summary subsequentes.

Como os hooks podem não executar quando o app quebra ou quando o worker do WDIO é morto à força, o vídeo e os logs do caso são best-effort; `summary.json` e `summary.md` continuam sendo o relatório principal de toda a execução.

## Upload para a Plataforma de Relatórios

`scripts/ci/push-e2e-report-to-feedback.mjs` faz o upload estritamente em duas etapas, conforme a API de relatórios:

1. `POST /v1/agent/e2e-reports`, enviando `summary.json` e `summary.md` como `multipart/form-data`, e lendo o `report_id` retornado.
2. Ler, um a um, os `failures/**/case.json`. Se o manifesto apontar para um `video.webm` legível, chamar `POST /v1/agent/e2e-reports/{report_id}/video`, usando o título completo do caso com falha no campo `title` do formulário e o arquivo correspondente em `video`. Títulos diferentes são anexados; reenvio com o mesmo título é substituído atomicamente pelo servidor.

A chave de idempotência do upload do relatório é composta por `runId`, `client=desktop` e `platform` a partir do `summary.json`. Erros de rede ou `5xx` do servidor podem ser repetidos com segurança; erros de cliente, erros de autenticação e erros de tamanho de arquivo não são repetidos cegamente.

O CI precisa definir a variável mascarada:

```text
ZCODE_FEEDBACK_NOTIFICATION_TOKEN
```

Variável opcional:

```text
ZCODE_FEEDBACK_BASE_URL=http://intranet.example.invalid:8080
```

O job do GitLab salva o código de saída do E2E no `script` principal e depois executa, em sequência, o upload para o Bitable e para a plataforma de relatórios; o `after_script` só pode executar limpeza que não afete o status do job. Token ausente, erro de rede, `4xx/5xx` da plataforma ou upload com timeout geram apenas um warning; o upload do relatório não pode alterar o status do job de CI. A ausência do summary na etapa de upload também não introduz um novo código de falha de upload; a validade do summary continua sendo determinada pela cadeia de validação de summary anterior. Se o próprio E2E falhar, ainda se tenta enviar o relatório, retornando ao final apenas o código de saída do E2E e o da cadeia de validação do summary. O token de relatórios jamais é escrito no repositório, em artefatos ou em logs.

Executar o mesmo script localmente permite validar o upload do relatório; sem o ambiente do GitLab localmente isso não afeta o upload do relatório ou do vídeo, apenas a URL de artefato do GitLab não se aplica.

O entrypoint permanente do Windows `scripts/ci/run-e2e-bitable-loop.ps1` habilita `ZCODE_E2E_FAILURE_ARTIFACTS=1` para cada rodada de testes, preserva primeiro o upload existente de métricas de resumo para o Bitable e só então chama o uploader de relatórios. Antes de iniciar, é obrigatório configurar tanto as credenciais do Bitable quanto `ZCODE_FEEDBACK_NOTIFICATION_TOKEN`; a falha de upload no Bitable ou na plataforma de relatórios não impede a execução do outro uploader. `-UploadTimeoutSeconds` controla o limite do processo de upload para o Bitable, e `-FeedbackUploadTimeoutSeconds` controla o limite do processo de upload de relatórios, incluindo os vídeos.

## Limites de Paralelismo

O diretório de coleta é isolado por `worker-id + case-id + retry-index`. A etapa de upload só roda depois que todos os workers do WDIO terminaram e o `summary.json` foi escrito; portanto, os vídeos de falha de todos os workers são anexados ao mesmo `report_id` e não há modificação concorrente do mesmo relatório.

Dentro de um mesmo worker, os casos do Mocha rodam em série, e o byte offset é determinístico. Se no futuro houver casos concorrentes dentro de um worker, será obrigatório introduzir um contexto de log estruturado com `caseId` compartilhado entre main, host e agent, sem continuar usando atribuição por offset.

## Sanitização e Retenção

A plataforma de relatórios recebe o `summary.json` e o `summary.md` originais, e o conteúdo de erro segue a política de retenção de artefatos existente. Qualquer nova origem de runtime log deve filtrar Authorization, Cookie, API Key e access token. O vídeo não entra no ZIP do relatório e só é obtido por meio de um endereço de download temporário.