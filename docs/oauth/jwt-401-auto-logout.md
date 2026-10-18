# Logout automático por HTTP/business 401 de credencial de login do ZCode

## Objetivo

O servidor devolve HTTP `401` para credenciais de login confirmadamente inválidas, ou HTTP `200` com
corpo JSON completo contendo o valor numérico `code: 401`. A camada de serviço do Desktop compara o
Authorization da requisição com a credencial atual, notifica o Host e reaproveita a limpeza de logout
OAuth existente, o popup de login expirado e o reinício após confirmação.

2026-09-08, escopo mínimo de compatibilidade: manter a verificação de JWT do ZCode já existente e
adicionar a verificação do `access_token` de negócio do único active provider atual (BigModel ou ZAI).
A nova verificação cobre apenas `/api/biz/customer/getCustomerInfo` do ambiente atual, além das URLs
de userinfo configuradas por plataforma, aceitando tanto o Authorization nu quanto
`Bearer <access_token>`. A URL precisa casar origin e pathname ao mesmo tempo, e os query parameters não
participam da decisão de identidade.

2026-10-08, complemento: na resposta JSON completa de HTTP `200`, o valor numérico `code: 401` também
significa login inválido. A whitelist do token de negócio da plataforma atual ganha
`/api/biz/subscription/enterprise/v2/pricing` e
`/api/biz/team/subscribe/product/querySubscribeDetail`, que compartilham a verificação de HTTP 401 e de
401 de negócio com customerInfo/userinfo.

Pagamentos/pedidos, listagem/criação/cópia de API key, requisições de API key de modelo e requisições
dentro do WebView não entram na nova verificação. A mesma interface de customerInfo, mesmo quando chamada
por uma atualização de configuração de modelo, continua sendo uma consulta de identidade de
usuário/equipe; o fato de o chamador de cima ser diferente não muda a semântica de 401 dessa interface.

## Saída das requisições

```text
Camada de serviço -> NodeApiClient.request -> HTTP 401 ou HTTP 200 + JSON code=401
                                    |
                     +--------------+----------------+
                     |                               |
              JWT atual do ZCode        Whitelist de identidade/preço/detalhe de assinatura da plataforma atual
                     |                     + access_token atual
                     +--------------+----------------+
                                    |
                       logout existente -> broadcast -> popup de expiração
                                    |
                       Reinício após confirmação (refresh no Web)
```

O ponto de observação emite apenas um callback com a URL da requisição e o Authorization, sem ler nem
escrever credenciais diretamente. No lado do Host, a deduplicação é feita revalidando a credencial
atual dentro da fila de sessão, e o fluxo existente de logout/limpeza de provider derivado é chamado.
Depois que um 401 é retornado, a credencial atual é lida, e um token antigo ou uma requisição de
plataforma não ativa não pode disparar o novo tratamento. Depois de ler o access token, a plataforma
ativa é reconfirmada para evitar que a leitura assíncrona atravesse uma troca de plataforma.

## Fronteiras de compatibilidade

Um 401 comum do servidor antigo pode ser classificado pela credencial da requisição; a restauração de
startup continua responsável pela pré-julgamento do `exp` do JWT local, e esse pré-julgamento não
substitui a decisão de revogação do servidor. APIs Key que acessem o serviço oficial contornando
diretamente a saída de requisições do ZCode não são protegidas por este mecanismo.

Nenhuma refresh, análise de expiração, sondagem ativa ou limpeza de chaves históricas é adicionada.
Erros de negócio diferentes do valor numérico `code: 401` dentro de HTTP 200, corpo vazio, HTML, JSON
corrompido, 403 e falhas de rede não disparam este mecanismo. A observação de 401 de negócio só roda em
uma whitelist explícita de interfaces de negócio OAuth, a leitura da cópia é limitada a 64 KiB e espera
no máximo 1 segundo por requisição; timeout, excesso de limite ou falha de parsing cancelam a cópia
observada e devolvem imediatamente a resposta original, sem consumir o corpo do chamador. Respostas SSE
não são lidas nem esperadas até o fim. A arquitetura de conta do CLI independente não faz parte do
Todo103.

O popup, a internacionalização e o tema existentes são reaproveitados, sem modificar a UI, o protocolo
de broadcast ou a ação de reinício. O attachment de shared-host do celular continua consumindo o
broadcast de Host existente, sem novos Hosts/Agents e sem mudar a semântica de mensagens entre
desktop-continuous e web-remote-replayable. O OAuth independente da Web e o transport MCP oficial do
Agent não recebem novos interceptadores por causa disso.

## Aceitação

- HTTP 401 nas interfaces alvo do business token atual de BigModel/ZAI dispara o mesmo callback de
  invalidez; tanto token nu quanto Bearer são cobertos;
- HTTP 200 + JSON `code: 401` nas interfaces da whitelist de BigModel/ZAI dispara o mesmo callback de
  invalidez; o corpo da resposta continua podendo ser analisado normalmente pelo chamador;
- domínio errado, ambiente errado, caminhos de pagamento/pedido/API key, API key anônima/comum, token
  antigo e plataforma não ativa não disparam o novo callback;
- o teste de isolamento de ambiente injeta explicitamente para BigModel/ZAI os conjuntos de endereços
  de negócio e de userinfo `production.example` e `test.example`, verificando em cada um dos dois
  produtos que o endereço atual dispara e o endereço do outro ambiente não dispara; o teste não depende
  de domínios reais de teste e de produção serem diferentes e, mesmo após reescrita dos endereços por
  código aberto, preserva o mesmo conjunto de asserções;
- atualizar o token ou trocar de plataforma antes de o 401 atrasado retornar não notifica invalidez da
  sessão antiga;
- outros erros de negócio em HTTP 200, corpo vazio/corrompido, SSE, 403 e 500 não disparam; os testes
  originais de 401 de JWT do ZCode continuam passando;
- E2E de Electron isolado obtém separadamente HTTP 401 local e HTTP 200 + 401 de negócio por meio de
  requisições reais do Host, confirmam que as credenciais de autenticação foram limpas antes do aviso e
  que o comando de reinício existente é chamado após a confirmação; não são usadas credenciais reais de
  usuário nem requisições a plataformas reais.

A causa do 401 de negócio é o servidor empacotar expiração de login em HTTP 200; o observador antigo só
verificava o status HTTP, o que fazia a disponibilidade do projeto degradar para unknown, a precificação
lançar uma mensagem genérica e o resumo de assinaturas perder o motivo, mantendo o estado de login
antigo. A correção reaproveita a mesma entrada de invalidez, a revalidação de credencial e o broadcast, e
não interpreta uma resposta temporariamente vazia como expiração. Também pode ocorrer um novo login
durante a cópia em parsing, então a limpeza final continua obrigatoriamente revalidada dentro da fila de
sessão; interfaces concorrentes produzem apenas uma limpeza real e um aviso. A leitura limitada da cópia
observada garante que um chunked body anormal não altere o ciclo de vida da requisição principal.

## SG-01: proteção de submissão da sessão para 401 atrasado (2026-09-09)

Motivo: depois que o classificador lê um access token antigo, o mesmo provedor pode concluir um novo
login; apenas reconfirmar o provider ativo ainda deixaria a resposta antiga passar. O resultado da
classificação é apenas um candidato e não pode servir diretamente como autorização para limpar o login
atual.

O Host entrega a URL/Authorization da requisição ao `logoutIfCurrentCredentialRequest` local do
OAuthService. Esse método reclassifica dentro do `sessionMutationQueue` existente e limpa as credenciais
na mesma tarefa da fila; somente quando a limpeza realmente tem sucesso é que os providers derivados são
notificados e o popup de expiração é transmitido; se a limpeza da configuração derivada falhar, um
warning é registrado e o aviso da sessão encerrada é mantido. Cada candidato entra na fila, evitando que
um 401 de uma credencial nova seja descartado enquanto um candidato antigo aguarda. O logout manual, a
verificação de JWT e a whitelist de interfaces permanecem compatíveis, e nenhum método de UI/RPC é
adicionado. A fábrica retorna um OAuthService concreto para a montagem do Host no mesmo módulo, e o
método local não entra no contrato cross-platform de IOAuthService.

```text
HTTP 401 -> classificação preliminar -> a credencial da requisição entra na fila de mutação de sessão do OAuthService
                           |
              novo login/refresh é submetido primeiro -> credencial não bate -> ignorar, sem broadcast
              o 401 antigo é submetido primeiro     -> conferir e limpar -> transmitir
                           |
              um novo login posterior ainda é escrito pela mesma fila e não é sobrescrito pela limpeza antiga
```

A troca de rede do refreshToken permanece fora da fila, enquanto a escrita de volta entra na mesma fila e
valida a generation da sessão, o provider e o access token de antes da troca; um refresh expirado não
pode ressuscitar credenciais depois do logout nem sobrescrever um novo login. Nenhuma capacidade de
refresh é adicionada e os adapters atuais de BigModel/ZAI não oferecem troca de refreshToken.

O state owner continua sendo o OAuthService do Host atual; essa fila serializa login, logout e escrita de
refresh nesta instância, sem introduzir transações entre processos nem mudar o formato do
credentials.json. As operações de arquivo concorrentes entre Hosts/CLI continuam respeitando as
fronteiras existentes do credential store. As fronteiras de attachment, broadcast, aviso e reinício de
desktop continuous / replayable do celular permanecem inalteradas.

### Restrição de integração do Todo103: preservar a identidade da conta encerrada

A saída condicional, assim como o logout manual, lê o accountIdentity da conta original dentro da fila de
sessão e antes de limpar as credenciais, e então entrega provider + accountIdentity ao callback de
limpeza derivado existente. Não pode voltar a ser a entrada antiga que passava apenas a plataforma, nem
adivinhar a identidade depois que as credenciais foram esvaziadas. A limpeza derivada fora da fila
continua seguindo a fronteira de serviço existente de limpeza por identidade de conta; isso não refaz a
sincronização de estado de conta nem transações entre Hosts. É preciso cobrir a passagem de identidade nos
dois lados BigModel/ZAI, a semântica de erro do logout manual, o 401 duplicado concorrente e a regressão
em que uma requisição antiga que retorna depois de um novo login/refresh não faz limpeza indevida.

Regressões: o classificador lê um token antigo e o mesmo provedor troca por um novo token; novo login do
mesmo provedor antes do candidato entrar na fila; uma nova escrita de sessão aguarda durante a checagem de
invalidez; o resultado do refresh retorna depois do logout; um 401 do token atual normal continua
disparando apenas a limpeza e o aviso originais. A fronteira da fila é provada por testes da camada de
serviço com temporização controlada, a cadeia de 401 normal é reconfirmada pelo AUTH-06 do Electron, e a
condição de corrida do token antigo sem broadcast é coberta por testes controlados da camada de serviço.

## CR-01: exceções na configuração isolada de URL (2026-09-09)

Motivo: quando os endereços candidatos são construídos de forma centralizada, uma exceção no business
base URL bloqueia um outro userinfo válido; e construir a configuração completa da plataforma só para
obter o userinfo também introduz exceções em endereços de autorização/login sem relação.

O endereço da requisição é resolvido com segurança apenas na fase de classificação do access token, e os
candidatos de customerInfo e de userinfo são construídos e resolvidos separadamente; endereços
inválidos (incluindo endereços relativos e protocolos não HTTP(S)) apenas pulam a si mesmos, sem
bloquear candidatos válidos. Quando todos os candidatos são inválidos ou o endereço da requisição é
inválido, retorna-se false e a resposta HTTP é entregue normalmente ao chamador. Overrides em branco
continuam seguindo a regra de endereço padrão da configuração original. A resolução do endereço de
userinfo é compartilhada entre a configuração da plataforma e o classificador, sem alterar a validação de
configuração existente no startup da plataforma e sem imprimir a configuração ou as credenciais brutais.

Aceitação: userinfo inválido em BigModel/ZAI não afeta um customerInfo válido; business base inválido não
afeta um userinfo válido; exceções de configuração sem relação não participam da classificação; override
em branco, requisição inválida e todos os candidatos inválidos têm regressão; o ramo original de JWT não
depende da nova resolução de URL.