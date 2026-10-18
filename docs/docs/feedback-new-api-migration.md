# Spec de migração para a nova API de feedback

## Contexto

O serviço de feedback de problemas migrou da interface antiga em um domínio de feedback separado para a nova interface do ZCode Server:

- Interface antiga: `https://feedback.example.invalid/v1/tickets`
- Nova interface de produção: `https://zcode.z.ai/api/v1/feedback/*`
- Nova interface de teste: `https://zcode.z.ai/api/v1/feedback/*`

A interface de UI e de serviço RPC não é estendida por enquanto, e `IFeedbackService` continua expondo à UI as capacidades existentes de criação, listagem, detalhes, comentários e upload de anexos. A migração fica restrita ao protocolo HTTP da camada services, à autenticação, ao mapeamento de campos e ao cache anônimo de tickets.

O feedback API base padrão precisa acompanhar o resolvedor de endpoints unificado do ZCode:

- Com `ZCODE_ENV=production` ou sem definição explícita, o padrão é `https://zcode.z.ai/api/v1`.
- Com `ZCODE_ENV=test`, o padrão é `https://zcode.z.ai/api/v1`.
- As sobrescritas unificadas de endpoint, como `ZCODE_BASE_URL`, `ZCODE_TEST_BASE_URL` e `ZCODE_PRODUCTION_BASE_URL`, continuam valendo.
- `ZCODE_FEEDBACK_API_BASE` ou o `apiBaseUrl` passado explicitamente existem apenas como sobrescrita manual, com prioridade acima do valor padrão do ambiente.

A saída HTTP da API de feedback precisa convergir no `ApiClient` unificado da camada services, sem chamar o `fetch` global diretamente. O `ApiClient` unificado é responsável pela reescrita de endpoint do ZCode Server, pelo `x-request-id` e pela injeção de parâmetros comuns em `buildZCodeSourceHeaders()`; o módulo de feedback apenas sobrepõe a isso os headers e o corpo da requisição aos quais a própria interface dá importância. Assim, ao adicionar futuramente um novo parâmetro comum do ZCode Server, basta modificar o API client/source headers unificado, sem necessidade de complementar campos módulo a módulo.

## Contrato da nova interface

Todas as respostas da API de feedback seguem o mesmo formato:

```json
{
  "code": 0,
  "msg": "ok",
  "data": {}
}
```

`code !== 0` ou HTTP fora de 2xx são considerados falha; a mensagem de erro usa prioritariamente `msg` e, em segundo lugar, o corpo da resposta.

Interfaces principais:

- `POST /feedback/ticket`: cria um ticket de feedback, com JWT opcional.
- `GET /feedback/ticket`: consulta a lista de tickets do usuário autenticado, exige Bearer JWT.
- `GET /feedback/ticket/{ticket_id}`: consulta os detalhes do ticket. Usuários autenticados usam Bearer JWT; usuários anônimos precisam enviar `X-Device-Mid`.
- `POST /feedback/ticket/{ticket_id}/message`: acrescenta uma mensagem. Usuários autenticados usam Bearer JWT; usuários anônimos precisam enviar `X-Device-Mid`.
- `POST /feedback/attachment/upload-credential`: obtém a credencial de upload direto por formulário do OSS; usuários autenticados usam Bearer JWT; usuários anônimos precisam enviar `X-Device-Mid`.

## Autenticação e identidade anônima

A camada de serviço reutiliza o `deviceMid` de telemetry do host unificado do desktop como `device_mid` anônimo do feedback:

- O `deviceMid` é garantido de forma síncrona pelo processo main antes da criação da janela, via `telemetry-state.json`, e injetado no host process.
- O serviço de feedback não mantém mais um `zcodefeedbackclientid` independente, evitando que a mesma máquina seja dividida em vários dispositivos entre telemetry, ARMS, controle remoto e feedback.
- O antigo `zcodefeedbackclientid` / `X-Feedback-Client-Id` é mantido apenas como dado obsoleto nas credenciais locais, sem participar das requisições à nova interface nem do isolamento da lista anônima.

Regras de headers:

- As requisições de feedback são enviadas pelo `ApiClient` unificado e carregam automaticamente os parâmetros comuns do ZCode Server, como `User-Agent`, `HTTP-Referer`, `X-ZCode-App-Version`, `X-Platform`, `X-Release-Channel`, `X-Client-Language`, `X-Client-Timezone`, `X-Os-Category`, `X-Os-Version` e `x-request-id`.
- Se as credenciais locais contiverem `zcodejwttoken`, a requisição envia `Authorization: Bearer <token>`.
- Todas as requisições da API de feedback enviam `X-Device-Mid: <telemetry deviceMid>`, usado para atribuição de tickets anônimos e acesso aos detalhes.
- O corpo de `POST /feedback/ticket` também envia `device_mid`.
- Não são mais enviados o `X-Feedback-Client-Id` nem o `X-Feedback-Account-Id` da interface antiga.

Usuários anônimos não conseguem chamar a interface de lista do servidor. Após uma criação anônima bem-sucedida, o client mantém localmente um cache mínimo de tickets no diretório de dados de feedback, usado para exibir a lista “我的反馈”. A lista de usuários autenticados segue o `GET /feedback/ticket` do servidor.

## Mapeamento de campos

Na criação de um ticket, as entradas antigas da UI são mapeadas para a nova requisição:

- `title` -> `title`
- `description` -> `content.description`
- `type` -> `content.function`
- `severity` -> `content.severity`
- `contact` -> `contact`
- `device` -> `environment`

`environment` contém no mínimo:

- `app_version`
- `platform`
- `release_channel`
- `os_category`
- `os_version`

`platform` usa a mesma chave de arquitetura de sistema de `GET /client/configs?platform=...`, por exemplo `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`. `os_version` usa o release curto do sistema (`node:os.release()`), evitando que a string completa do kernel Darwin no macOS ultrapasse o limite de tamanho de `feedback_tickets.os_version` no backend.

Campos adicionais do snapshot de dispositivo são gravados de forma achatada em snake_case dentro de `environment`, sem ficar mais aninhados no campo `device`. No lado da UI, os detalhes continuam mapeando `environment` de volta para `FeedbackDeviceInfo`, mantendo a legibilidade dos componentes atuais.

Mapeamento de status:

- `submitted` -> `已提交`
- `closed` -> `已归档`
- Status não reconhecido -> `已提交`

Onde `已归档` é um valor de status interno mantido pela camada de serviço para compatibilidade com o `FeedbackTicketStatus` existente; a lista “我的反馈” e os detalhes exibem ao usuário “已完成” em chinês e `Completed` em inglês, sem expor ao usuário a nomenclatura de compatibilidade da interface.

A nova interface não tem a semântica antiga de type/module/assignee/event. A camada de serviço mantém a compatibilidade de tipos da UI:

- O retorno da criação usa o `type`, o `module` e o `severity` informados nesta interação.
- Quando a lista do servidor não traz tipo, o mapeamento padrão é `bug`.
- As mensagens nos detalhes são mapeadas como `comments`, e um evento de sistema para exibição é gerado.

## Upload de anexos

A nova interface não suporta mais o protocolo antigo de `attachments:init`, PUT em chunks e `attachments:complete`. A camada de serviço passa a usar uniformemente o upload direto por formulário do OSS:

1. Chama `POST /feedback/attachment/upload-credential`, informando `ticket_id`, o `message_id` opcional, `file_name` e `size`.
2. Constrói um formulário `multipart/form-data` com o `host`, o `path`, a policy, a assinatura e as informações de callback retornados pelo OSS.
3. O campo de arquivo é enviado por último no formulário, e o progresso do upload é reportado à UI.
4. Depois que o OSS retorna 2xx, a camada de serviço monta um `FeedbackAttachment` com as informações atuais do arquivo e o retorna.

O cancelamento do upload continua interrompendo a requisição atual do OSS por meio do `AbortController` e lançando um `FeedbackUploadCanceledError`.

Quando o formulário de feedback envia logs de diagnóstico por padrão, ele continua usando o fluxo completo de arquivamento, mas o conteúdo arquivado cobre apenas os logs necessários para localizar o problema e uma configuração leve. O limite de pré-verificação do anexo de logs no cliente é 1GB; para evitar que o envio de fluxos de protocolo de alta frequência ou o cache de plugins infle o arquivo, o full archive exclui:

- `dev`
- `sessions`
- `session-bindings`
- `checkpoints`
- `repo-snapshots`
- `repo-wiki`

Onde `repo-snapshots` / `repo-wiki` são os diretórios de dados históricos das funcionalidades já desativadas de upload de snapshots de Repo e de Repo Wiki: mesmo em dados de usuários que já atualizaram, ainda podem sobrar resíduos (os pacotes de snapshot criptografados podem chegar a vários GB, e o corpo do Wiki contém caminhos de repositório e informações de referência), e a fronteira de privacidade de arquivamento das funcionalidades desativadas precisa continuar valendo.

## Limites de erro de rede e retentativa

A API de feedback é emitida pelo `fetch` / Undici do Node.js. Erros de rede precisam ser normalizados no classificador unificado de erros de rede da API da camada services; os chamadores, como feedback e conectividade de modelos, não devem manter listas de códigos de erro divergentes entre si.

Somente erros da fase de conexão dos quais é possível confirmar que a requisição ainda não chegou ao backend podem ser repetidos automaticamente, incluindo:

- `UND_ERR_CONNECT_TIMEOUT`
- `UND_ERR_CONNECT_ERROR`
- `ENOTFOUND`
- `ETIMEDOUT` com evidência explícita de conexão em `connection attempts timed out` ou `connect ETIMEDOUT`
- `ENETUNREACH`
- `EHOSTUNREACH`
- `ECONNREFUSED`
- `ECONNRESET` ocorrendo explicitamente antes do handshake TLS

Desconexões comuns de socket após o envio do corpo, cancelamento pelo usuário, timeouts de negócio e falhas HTTP não devem ser repetidos automaticamente como erros de conexão. Enquanto o backend não oferecer um contrato de chave de idempotência, `POST /feedback/ticket` só pode repetir as falhas acima em que «a requisição ainda não chegou ao backend», evitando criar tickets duplicados quando a resposta se perde.

Depois que as retentativas se esgotam, o log da camada services deve preservar a URL de destino com mascaramento, o código de erro, o número de tentativas e o tempo decorrido. A UI precisa ramificar a mensagem e as ações seguintes conforme o ticket já tenha sido criado ou não:

- Quando a falha ocorre antes da criação do ticket, não se exibe diretamente a mensagem de runtime original como `fetch failed`; em vez disso, orienta-se o usuário, no idioma atual, a verificar a rede, a VPN ou o proxy e tentar de novo. O rascunho enviado, as capturas de tela e os dados de contato precisam continuar preservados, e o usuário pode reenviar no próprio formulário original.
- Quando o ticket já foi criado e o envio de materiais posteriores, como logs, falha e entra em estado de erro, não se deve pedir que o usuário reenvie o formulário inteiro. O estado de fundo precisa informar claramente “工单已创建，但后续材料上传失败” e, ao clicar, abrir diretamente o ticket já existente, evitando a criação duplicada. As capturas de tela mantêm a semântica atual de degradação por anexo: em caso de falha, escrevem um comentário de sistema e a submissão continua, sem que a correção de roteamento de erros desta vez transforme isso em falha geral.

## Impacto em múltiplas plataformas

Esta migração altera apenas o protocolo HTTP de feedback e o cache de persistência em `packages/services`, e não muda:

- o protocolo stdio entre app e agent.
- task stream, snapshot, queue, owner command.
- a fronteira entre `desktop-continuous` no desktop e o controle remoto `web-remote-replayable` no celular.
- a lógica de main process, relay ou attachment do remote host.

Tanto as janelas locais do desktop quanto as remotas acessam a nova interface pelo mesmo serviço de feedback dentro do host process; a cadeia de controle remoto Web/mobile não ganha um runtime de Agent independente nem estados de negócio novos.

## Verificação

É obrigatório cobrir:

- A criação de ticket passa por `/feedback/ticket`, com corpo contendo `device_mid`, `content` e `environment`, e envia Bearer JWT e `X-Device-Mid`.
- As requisições da API de feedback precisam ser emitidas pelo `ApiClient` unificado injetado, sem contornar a convergência de parâmetros comuns chamando o `fetch` global diretamente.
- Sem JWT, a criação anônima usa o telemetry `deviceMid` injetado pelo host, sem gerar nem persistir um ID de cliente de feedback independente.
- Sem JWT, a lista não consulta o servidor e retorna o cache anônimo local pelo telemetry `deviceMid`.
- Com JWT, a lista consulta a interface do servidor e mapeia os status.
- O anexo é concluído via upload credential + upload direto por formulário do OSS, com suporte a progresso e cancelamento.
- Falhas retentáveis na fase de handshake de rede continuam sendo repetidas.
- Com uma falha inicial de `UND_ERR_CONNECT_TIMEOUT` do Undici e recuperação posterior, a retentativa automática tem sucesso.
- Após três falhas consecutivas de conexão do Undici, as retentativas param, registrando o número de tentativas e o código de erro.
- Depois de esgotar as retentativas de erro de conexão, o formulário de feedback exibe uma mensagem de rede localizada, sem exibir o `fetch failed` original, e preserva a descrição atual, as capturas de tela e os dados de contato para o usuário tentar de novo.
- Quando o envio de materiais posteriores ao ticket criado, como logs, sofre erro de rede e entra em estado de erro, exibe-se a mensagem localizada “工单已创建” e a entrada de fundo abre o ticket já existente em vez de reabrir o formulário de envio.
- Executar `pnpm typecheck` e `pnpm lint` por completo.