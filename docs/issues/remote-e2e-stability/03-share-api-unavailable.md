# Falha intermitente da interface de produção de compartilhamento de artefatos SSH

Status: needs-triage

## Fatos de execução confirmados

Baseline de negócio `54ece08f23f79ae54aea1f51e0d941497d627392`, build de produção do mesmo código-fonte, usando uma conta real já validada como funcional.
O Desktop gerou `report.html` na Source por meio de uma conexão SSH oficial, e o arquivo contém os marcadores de teste; a publicação foi confirmada pela UI do produto.

- `r3-server-20260924090435267-55e0c4` publicou com sucesso, e a pré-visualização pública e o download do arquivo passaram nas asserções.
- `r3-server-20260924091406992-dde620` e `r3-server-20260924091613035-7dbace` falharam de forma independente, com o artefato já enviado e o processo parado na etapa checking.
- `r3-server-20260924093538609-e2bdb1` voltou a ter sucesso, o que mostra que não se trata de uma conta sempre indisponível nem de arquivo remoto ausente.
- `r3-server-20260924094553403-374a70` falhou novamente. Para o Source Core exclusivo deste caso, foi feita apenas uma observação de leitura dos eventos de diagnóstico HTTP do Node, que registrou na produção
  `POST /api/v1/shares/preparations/<id>/confirm` retornando **HTTP 503**, com tipo de resposta JSON.
  ID da requisição: `20260924094737fb81e1d45bbdf211785c`, momento de observação da resposta `2026-09-24 09:48:07.717 UTC`.

As evidências HTTP estão em [registro de campos seguros](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/share-http-observation2.jsonl);
as etapas das duas falhas independentes estão em [primeira](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/share-final-1.json) e
[segunda](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/share-final-2.json).
A observação não modificou requisição nem resposta e não salvou cabeçalhos de autenticação nem corpo; o processo de observação foi descartado junto com o contêiner do caso.

## Limites e investigação restante

Está confirmado que desta falha houve um 503 real do servidor, portanto ela não pode ser classificada como tempo de espera do WDIO nem ser escondida por retentativas automáticas.
A causa raiz do 503 no backend ainda não foi determinada; é necessário consultar os logs do serviço de compartilhamento ou do upstream pelo ID da requisição.
As duas falhas anteriores na etapa checking e uma falha mais antiga na etapa uploading não coletaram o status HTTP, portanto não é possível afirmar que todas têm a mesma causa.
A interface mostra apenas a etapa de falha e a mensagem "服务端未返回可定位详情" (o servidor não retornou detalhes localizáveis), sem um ID de requisição utilizável; a diagnosticabilidade do erro ainda precisa ser investigada.

O teste passou a aguardar simultaneamente um estado final de sucesso e um estado final de falha explícita, registrando imediatamente etapa, texto e tempo decorrido em caso de falha; em caso de sucesso, ainda exige a reconciliação dos bytes baixados.
As duas falhas na etapa checking chegaram a um estado final em cerca de 12,5 segundos cada, evitando a espera incondicional de 120 segundos da lógica antiga. Nenhum código de negócio ou de servidor foi modificado.

Ponto de entrada para reprodução: em um diretório de implantação de build de produção isolado, execute `node harness/remote/run-queue.mjs share` com `R3_BUILD_ENV=production R3_LIVE_HOME=<HOME dos materiais da conta>`.
Preserve cada resultado independente; não agregue apenas as rodadas bem-sucedidas.
