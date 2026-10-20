# Migração da autenticação de primeira parte para Token

Status: o ponto de entrada de requisições somente-Token já foi integrado e a persistência do Key ID foi implementada; as regressões locais relacionadas passaram, mas a verificação completa do CLI ainda tem falhas de baseline históricas já reproduzidas, detalhadas no registro de validação abaixo. Em 2026-09-23 o usuário confirmou finalmente: manter a busca/criação da Key dedicada, trocar o apiKey retornado por um Token; remover o Copy Secret e o fallback para a Key antiga.
A [revisão da migração](https://internal-docs.example.invalid/redacted) e o
[handoff de testes](https://internal-docs.example.invalid/redacted) foram atualizados junto da implementação final.

## Comportamentos confirmados

- Pessoal/equipe/Standalone busca a Key dedicada; cria quando ela não existe. Nome pessoal `zcode-api-key`; nome de equipe `zcode-team-api-key`, mantendo `keyType=2`; a criação define explicitamente `usageScene=1`. A consulta não acrescenta filtro por `usageScene`.
- O `apiKey` retornado é o ID da Key, que não é Secret, e funciona como parâmetro de caminho na emissão. Organização, projeto e Key ID são codificados separadamente, sem escolher Key entre projetos.
- POST /api/biz/v1/organization/{org}/projects/{project}/api_keys/{id}/access_tokens, usando o JWT de login como Bearer, com body contendo `clientType=zcode` e o `clientVersion` real.
- Todos os endpoints de negócio que antes usavam API Key podem usar Token; são revalidados por uma tabela de testes por endpoint, sem manter a compatibilidade como bloqueio prévio da implementação.
- O novo cliente usa apenas Token; sem fallback para a Key antiga. Com `enable=false` explícito, sem PAT disponível, falha na emissão ou resposta malformada, registra log redigido e falha; a renovação antecipada de um PAT válido existente só tolera falhas conforme a regra de falha transitória abaixo; quando `enable` é omitido, trata como habilitado por padrão, mas continua validando estritamente o Token e a validade.
- O Project Access Token é emitido pela plataforma e continua obedecendo às regras de admissão de verificação de segurança de requisição da versão oficial; não pode ser pulado por usar Token; o comportamento de verificação de segurança das Keys manuais do usuário é preservado.
- Keys manuais do CLI com marcador de origem explícito `manual` mantêm semântica independente; registros antigos sem marcador de origem e sem OAuth não permitem determinar se são Keys derivadas antigas, exigindo novo login ou nova escolha de Key manual, sem adivinhar a origem e fazer fallback. Keys de Providers de terceiros mantêm o contrato original; Start Plan, MCP oficial e o canal de identidade JWT existente no reset são preservados.
- Não se lê nem se armazena mais o Secret de longo prazo derivado de OAuth, e não se remove o estado de login compartilhado por clientes antigos; Keys manuais não são limpas. Capacidades que usam as interfaces originais do servidor não são reescritas pelo novo cliente.

## Contrato de compatibilidade do gerenciamento de Key dedicada

- Pessoal continua reutilizando `zcode-api-key` pelo nome; entradas de mesmo nome sem ID causam falha, sem criação duplicada. Equipe só reutiliza entradas com nome `zcode-team-api-key`, `keyType=2` e ID não vazio; a resposta de criação também precisa satisfazer essas três condições, caso contrário a troca de credencial é proibida. Entradas ruins sem relação não afetam as entradas válidas.
- Nas duas families, `customerInfo` usa o JWT de login original, de forma consistente com a verificação de identidade do login, evitando que uma recusa por formato Bearer seja interpretada indevidamente como login inválido. A listagem/criação de Keys mantém o Authorization antigo: pessoal BigModel usa o JWT de login original, Z.AI usa Bearer; equipe usa o JWT de login original nas duas families, preservando os cabeçalhos de organização/projeto. `access_tokens` usa Bearer de forma unificada.
- Na seleção pessoal do desktop com projeto que não é de equipe (`projectType` diferente de 2 após remover espaços), pula candidatos sem ID de organização; Standalone mantém a regra de priorizar a organização/projeto padrão e, na falta dela, o primeiro item, sem novo filtro por tipo de projeto. A comparação de vínculo de membro da equipe continua removendo espaços nas duas pontas do ID.
- A estratégia de seleção de projeto é passada explicitamente pelo chamador ao cliente público de troca de credencial, participando do escopo de ID em memória e persistido, evitando que desktop e CLI sobrescrevam a seleção um do outro ao compartilhar o registro. O owner existente do Token, a renovação e a sequência de invalidação no logout permanecem inalterados.
- A aceitação cobre resposta de criação de equipe incorreta, entrada ruim sem relação, ID ruim em entrada pessoal de mesmo nome, cabeçalhos das requisições de gerenciamento/emissão nas duas families, seleção de projeto mista e isolamento de ID entre estratégias.

## Verificação de dependências de credenciais antigas e restrições de upgrade

Recuperação de conta OAuth, verificação de disponibilidade e autenticação de requisições não podem ler, descriptografar nem depender do antigo `account-provider:*:api-key`; quando o estado de login é válido e a Key antiga está ausente ou com ciphertext corrompido, ainda troca por Token usando a identidade original da conta. Registros antigos Standalone sem marcador de origem mas com OAuth usam OAuth automaticamente; apenas `manual` explícito lê a Key manual, e o modo manual não depende de o OAuth guardado separadamente ser descriptografável. Registros históricos ambíguos sem estado de login ainda exigem escolher novamente o método de login.
O Provisioning remoto sincroniza apenas a allowlist OAuth, e o remoto emite pelo seu próprio owner de Token; não exporta Keys de contas antigas nem Tokens de curto prazo, e não copia cache de Key ID entre ambientes. Entradas antigas de `account-provider` com `schemaVersion=1` só são aceitas após validação de formato e então ignoradas, sem ler, sobrescrever ou apagar Keys antigas/manuais existentes. Keys de Providers manuais explícitos no Personal Config continuam sendo sincronizadas pelo canal de configuração original.
A verificação de prontidão do Key ID de equipe e a validação de credencial não vazia no momento da requisição devem ser mantidas; o campo de transporte `apiKey` mantém compatibilidade temporariamente, e seu valor OAuth é o Token. Remover a função de atualização de impressão digital de Key na UI que não tem chamadas e a injeção inválida de Credential Store evita reintroduzir a condição “a Key precisa estar em disco para funcionar”. Token de login inválido, falta de permissão e falha na criação do ID de equipe mantêm erro explícito, sem fallback para a Key antiga.
O uso na autorização do workspace remoto adicional do Desktop prioriza a reutilização do owner Local Host existente em `sourceServices`; quando a entrada antiga de anexação não tem owner, usa a mesma fábrica de troca de credencial dentro da fronteira original de serviços locais, sem manter a implementação de Key antiga somente leitura e callback de resolução sempre nulo. Pessoal/equipe compartilham um cliente de Token e um ID Store, com limpeza de cache quando o login muda; o roteamento replayable do celular não muda.
Aceitação: Key antiga ausente/ciphertext corrompido mas com OAuth válido é recuperável; Key manual não é afetada por OAuth corrompido; Key antiga corrompida local ou remotamente não bloqueia a sincronização e o registro original não é alterado; envelopes antigos são aceitos mas não aplicam Key; exclusão de OAuth, rollback, idempotência e as fronteiras existentes de owner/fluxo celular/desktop são preservadas.

Julgos mantidos nesta rodada de verificação: validação não vazia de `api-key` configurado manualmente; validação de prontidão de ID do `apiKeyStatus` de equipe; validação não vazia de `auth.apiKey` no momento da requisição (valor OAuth é o Token). Nenhum deles verifica se o Secret antigo do account-provider existe. A comparação de mudança de Key no salvamento da UI se aplica apenas ao acesso manual; o OAuth retorna valor vazio e é atualizado por eventos de conta/benefício.

Escopo de compatibilidade do upgrade: esta versão do Host não modifica registros de Keys antigas; há regressão do envelope schema v1 de Source antigo → Target novo. O Source novo produz v2, e a validação v1 do Target antigo rejeita antes de qualquer escrita, então a sincronização dá erro mas não apaga credenciais existentes; é preciso atualizar o Target para continuar sincronizando; o uso normal de recursos remotos usa o caminho de CDN correspondente à versão do cliente.

## Estado e fronteiras

```text
estado de login / identidade estável da conta → owner de autenticação existente → Token válido → uma tentativa HTTP
                         │                     ↑
                         └─ cache em memória / coalescência de concorrência ┘
logout / troca de conta → limpa cache e generation inválida → rejeita resultados tardios
```

O Host mantém `IAccountRequestAuthService`; Standalone mantém o adapter de requisição.
O Key ID pode ser persistido: guarda apenas organizationId/projectId/apiKeyId, isolado por ambiente, família, conta estável e projeto pessoal/equipe; Tokens de curto prazo e o JWT de login não entram nesse registro. Reutilizar o ID após restart troca a credencial diretamente; quando o emissor responde explicitamente 404, os metadados são limpos e a busca/criação acontece de novo na próxima vez; outros erros de autenticação apenas reportam erro, sem fallback para a Key antiga.
O Token não é escrito em Provider Config, Registry, Session, snapshot de UI, logs ou `credentials.json`.
A renovação segue a validade da resposta de emissão, com 120 segundos de antecedência mais jitter de 0–60 segundos; SSE já estabelecido é preservado, e uma nova tentativa HTTP checa a validade novamente. A renovação antecipada só reutiliza o PAT ainda não expirado e não rejeitado pelo modelo em caso de falha de rede/timeout explícita ou falha transitória HTTP 429/5xx, no máximo até o `expiresAt` original, permitindo nova renovação apenas a cada 5 segundos e registrando o evento redigido fixo `project_token_refresh_deferred`. Cache e pendências continuam gerenciados pelo mesmo owner, e requisições concorrentes compartilham a renovação e o resultado de degradação. 401/403/404, `enable=false`, cancelamento, exceções desconhecidas e respostas malformadas falham imediatamente e limpam o cache; falhas tardias durante logout ou troca de conta não podem devolver o PAT antigo. Quando uma rejeição explícita casa com a impressão digital, o valor antigo é removido primeiro, e uma renovação falha não pode reutilizá-lo. Essa tolerância não lê API Key de longo prazo, não estende a validade e não reproduz requisições ao modelo.
Respostas de emissão e de gerenciamento compartilham o contrato de código de sucesso: 0/200 numérico ou string; tipo do Token, valor não vazio e validade continuam sendo estritamente validados. Amostras reais de integração com o backend são registradas separadamente; teste de compatibilidade não equivale a integração concluída.

```text
mesmo owner de PAT: renovação antecipada → substituição do cache com sucesso
                         → falha transitória + PAT original válido e não rejeitado → valor antigo compartilhado, backoff de 5 s
                         → rejeição de autenticação / expiração / logout / resposta inválida → limpeza e falha
```

A identidade da conta não pode ser o hash de um Token de curto prazo. O isolamento de desktop continuous, celular replayable e `workspaceIdentity` é mantido.

## Longas tarefas e renovação das credenciais de login de negócio

Em tempo ocioso, cada tentativa HTTP física do modelo precisa trocar pelo PAT atual junto ao Host pelo canal privado de Provider Runtime Headers. Na despacho, apenas o tíquete e as restrições de escopo da conta são congelados; o PAT no momento do despacho não é tratado como credencial válida para a rodada inteira. `requestAuth.accountScope` é um valor de verificação de escopo irreversível gerado pelo Host (ciclo de vida do login, família, pessoal/equipe, organização/projeto/produto); não é identidade de conta, não contém PAT de curto prazo e não é persistido nem registrado em log. Requisições seguintes carregam `expectedAccountScope`; mudança de conta/plano ou mudança de escopo durante a troca de credencial falha imediatamente, sem aplicar o tíquete original a uma conta nova. O mock não tem PAT real, e a injeção estática original é mantida.

```text
despacho → owner de conta do Host gera valor de verificação de escopo + tíquete original
cada tentativa do modelo → canal privado de runtime headers (carregando o escopo esperado)
                 → o mesmo owner do Host verifica o escopo → checagem de TTL do PAT/troca de credencial → verifica o escopo de novo
                 → a CLI atualiza apenas o Token do Coding Plan, preservando o tíquete original e o JWT da rodada
logout/troca de conta/troca de plano → escopo não casa → a rodada atual falha, sem fallback para credenciais antigas
desktop continuous / celular replayable → mantêm o owner de task original, o workspaceIdentity e a ordem de eventos
```

No Desktop Z.AI, tanto o deep link quanto o polling chamam `/api/auth/z/login` na fronteira de login do `ZaiProviderAdapter`; `oauth:zai:access_token` já é um JWT de negócio, e o owner de PAT pessoal/equipe usa esse valor diretamente, sem segunda troca. Standalone armazena o Token OAuth original, portanto o ponto de troca de credencial é diferente. A regressão cobre a ordem completa polling → JWT de negócio persistido → metadados pessoal/equipe → emissão do PAT.

O resultado de sucesso de `/api/auth/z/login` no Standalone Z.ai é cacheado pelo valor mais entre `expires_in` / `expiresIn` e o `exp` do JWT, com renovação 120 segundos antes; sem metadados de validade o cache é de no máximo 5 minutos. Renovações concorrentes são coalescidas; clear/mudança de login rejeita resultados tardios. Em HTTP 401 de um endpoint de negócio só é permitido trocar novamente o JWT de negócio e repetir a troca de credencial uma vez; 403/erros de rede não disparam essa recuperação; um segundo 401 limpa o JWT de negócio que falhou, e chamadas seguintes ainda podem tentar de novo. Essa recuperação cobre apenas requisições de metadados/emissão e não reproduz a inferência do modelo.

A renovação antecipada do JWT de negócio reaproveita a classificação de falha transitória do adapter HTTP (rede, timeout, 429, 5xx). Somente quando a validade original conhecida ainda não terminou, o JWT não foi rejeitado e a geração do login não mudou, todas as chamadas concorrentes compartilham o valor antigo com backoff de 5 segundos; sem estender a validade, registrando o evento fixo `project_token_business_login_refresh_deferred`. O limite de cache de 5 minutos sem metadados de validade não representa a validade real, portanto não permite degradação em falha transitória. Rejeição de autenticação, cancelamento, erro desconhecido, resposta malformada, logout e troca de conta não degradam.

```text
ZaiBusinessTokenCache da CLI (único owner)
  → troca antecipada → sucesso: substitui o JWT de negócio
             → falha transitória + expiração conhecida não atingida + não rejeitado + mesmo login: compartilha o valor original, backoff de 5 s
             → outras falhas: limpa o valor original e reporta erro
  → clear / troca de login: rejeita resultados em trânsito; invalidate: proíbe degradação de JWT rejeitado
```

O PAT do Standalone, o posicionamento do Key ID e o single-flight do JWT de negócio Z.AI são gerenciados pelo resolver/cache owner, e não podem herdar o AbortSignal de nenhuma requisição individual de modelo (incluindo o `abortSignal` do execution context). O HTTP compartilhado mantém apenas o contexto de trace/logger, com timeout de 15 segundos por requisição; cada chamador espera de forma independente no nível externo de `resolve` / `resolveMaterial`, e o cancelamento encerra imediatamente a própria espera e remove o listener, sem limpar o cache compartilhado nem afetar outros esperadores. Chamadas já canceladas não iniciam a troca de credencial; depois que todos os esperadores cancelam, uma troca de credencial já em andamento continua sujeita ao timeout e à geração do login, e falhas tardias são consumidas. logout/clear continuam invalidando resultados em trânsito, sem reproduzir fluxos de modelo já estabelecidos.

```text
sessão A ─ espera independente (cancelar encerra apenas A) ─┐
                                   ├─ resolver/cache owner → HTTP de troca em single-flight (timeout de 15 s)
sessão B ─ espera independente ────────────────────────────┘                       → resultado em cache → B
```

Um HTTP 401 comum de modelo permite uma recuperação de PAT: vale apenas para pacotes pessoal/equipe e para requisições de PAT OAuth em tempo ocioso; Key digitada manualmente, Start Plan e cartões de aceleração não participam. A chamada de modelo mantém um orçamento de recuperação, reaproveitando o estado de retry `auth_refresh` existente e o ciclo de requisições físicas; falha na reemissão ou um novo 401 falha imediatamente, sem fallback para Key. O 401 é o gatilho para tentar a recuperação e não é tratado como causa confirmada de expiração do Token. `VERIFY_APIKEY_EXPIRED` / `VERIFY_SIGNATURE_INVALID` pertencem à recuperação de erro da própria verificação de segurança de requisição da versão oficial e mantêm o tratamento independente original.

```text
HTTP 401 do modelo (sem saída submetida) → requisição privada carrega o escopo de conta original + impressão digital SHA-256 do PAT que falhou
→ owner de autenticação original compara o escopo → invalida somente o PAT cuja impressão digital casa → coalesce emissões concorrentes
→ um retry com o novo PAT → sucesso / erro final
```

Todas as requisições de modelo OAuth retornam a restrição de escopo de conta; ela é validada antes e depois da troca de credencial, e trocar de conta/projeto não permite reaproveitar. Um 401 antigo tardio não pode limpar um PAT já atualizado; a impressão digital não entra na persistência, não é enviada ao upstream do modelo e não registra o texto da credencial. Depois que o SSE já emitiu texto, pensamento ou chamada de ferramenta, não há replay; o compact preserva a fronteira original de response-body. Cancelamento não dispara recuperação. Os owners de estado, o roteamento de sessão e as regras de replay do desktop continuous e do celular replayable não mudam, e o SSH continua trocando credenciais pelo canal privado original de Runtime Headers.

Aceitação: em tempo ocioso, na mesma rodada, um novo pedido após cruzar o TTL usa o novo PAT e o tíquete não muda; troca de conta/projeto e mudança no meio da troca de credencial falham; sem owner não é possível reaproveitar snapshot expirado; cobertura para JWT de negócio Z.ai cruzando TTL, renovação concorrente, recuperação única de 401, 403/rede sem retry e corrida de logout. SSE já estabelecido não é reproduzido.

Aceitação da recuperação de PAT do modelo: após o primeiro 401 o novo PAT é realmente usado; com orçamento 1 para requisições comuns ainda há uma chance de recuperação; segundo 401 / falha na troca encerra; o primeiro bloco de erro do SSE é recuperável, mas não há replay após saída de texto ou ferramenta; 401 tardio e concorrência não causam emissão duplicada nem limpam o PAT novo; cancelamento, Key manual, Start Plan e erros de verificação de segurança não disparam recuperação de PAT; o protocolo privado do SSH e o roteamento de subsessões preservam o escopo original e a impressão digital da falha.

## Consulta de assinatura e usos

pricing/customerInfo dos pacotes corporativos preservam o pré-aquecimento dos metadados de organização/projeto e da Key dedicada, sem Copy Secret.
1=pacote, 2=pago por uso, 3=mapeamento de estoque, -1=sentinela de cache; o tipo de criação permite apenas 1/2.
Todas as criações automáticas existentes são de pacote, usando 1. Nenhuma entrada de criação automática por uso foi encontrada, e nenhuma entrada nova é inventada.

## Tabela de testes de interfaces (2026-09-23)

Os resultados abaixo distinguem automação local de integração real com o backend; mock passando não significa compatibilidade em produção verificada. `…` representa o prefixo confirmado de caminho de gerenciamento `/api/biz/v1/organization/{org}`.

| ID  | Método / caminho                                                  | Ponto de revalidação                                                    | Autenticação após a mudança                | Resultado real                                                            |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| K01 | GET /api/biz/customer/getCustomerInfo                        | Localiza pela primeira vez organização/projeto pessoal/equipe; pula quando há ID persistido | JWT de login                           | Testes unitários de comum/serviço/CLI; E2E de desktop passou              |
| K02 | GET …/projects/{project}/api_keys                            | Reutiliza apenas o ID do nome dedicado; não acrescenta filtro por usageScene | JWT de login                           | Passou nas duas families, pessoal/equipe, combinações existente/ausente   |
| K03 | POST …/projects/{project}/api_keys                           | Cria quando ausente; usageScene=1; equipe também envia keyType=2          | JWT de login                              | Teste unitário + E2E de desktop BigModel/Z.AI passaram                     |
| T01 | POST …/api_keys/{apiKeyId}/access_tokens                     | Retorna Token de curto prazo; habilitado por padrão; falha explícita/erro | Bearer com JWT de login                  | Teste unitário + E2E de desktop nas duas families passaram                 |
| T02 | Registro local de ID / cache de Token                          | ID sobrevive a restart; isolado por conta/ambiente/projeto; Token não vai para disco; 404 limpa o ID, 403 não cria | Apenas persistência de ID          | Passou nos testes específicos de reutilização após restart/isolamento/invalidação |
| T03 | GET …/api_keys/copy/{id}                                     | O caminho OAuth de primeira parte não chama mais                          | Sem requisição                           | Limpeza de referência estática + teste unitário/E2E com Copy=0             |
| M01 | POST <provider-base>/v1/messages                             | Cada nova tentativa obtém o Token pela autenticação da requisição, mantendo o protocolo SSE/continuação | Project Token                      | Passaram os testes do serviço de autenticação/transporte da verificação de segurança; inferência real não executada |
| M02 | POST <provider-base>/chat/completions                        | Usa o mesmo Token de requisição quando a configuração suporta o protocolo | Project Token                           | Entrada de credencial compartilhada; sem E2E de protocolo independente neste ciclo |
| S01 | GET /api/v1/agent/configs；POST /api/paas/c1f3a7e2/v2/client | O Project Token obedece à admissão da verificação de segurança da versão oficial; a Key manual permanece | Project Token entra na verificação de segurança existente | Em 2026-10-09 foi corrigida a regra anterior de isenção de Token; resultado da regressão no documento temático correspondente |
| U01 | GET /api/monitor/usage/quota/limit                           | Pessoal/equipe usam Token; equipe mantém type=2 e cabeçalhos de org/projeto | Project Token                           | Regressão dos serviços de usage/quota passou; backend real não executado     |
| U02 | GET /api/monitor/usage/model-usage                           | Intervalo de tempo e type=2 de equipe preservados                        | Project Token                           | Regressão do serviço de uso passou; backend real não executado               |
| U03 | GET /api/monitor/usage/tool-usage                            | Intervalo de tempo, isolamento de equipe e comportamento com dados vazios preservados | Project Token                 | Regressão do serviço de uso passou; backend real não executado               |
| U04 | GET /api/monitor/credit-usage/activity                       | Pessoal type=1, equipe type=3 preservados                                | Project Token                           | Regressão do serviço de uso passou; backend real não executado               |
| U05 | GET /api/monitor/credit-usage/usage-detail                   | usageType=MODEL/MCP, intervalo de tempo, equipe type=3 preservados       | Project Token                           | Regressão do serviço de uso passou; backend real não executado               |
| U06 | GET /api/monitor/usage/model-performance-day                 | Estatísticas de desempenho e parâmetros de data preservados                | Project Token                           | Regressão do serviço de uso passou; backend real não executado               |
| O01 | GET /api/v1/off-peak/ticket/availability                     | Disponibilidade em tempo ocioso usa a identidade do pacote atual            | JWT existente + X-Coding-Plan-Api-Key: Token | Regressão de client/integration de tempo ocioso passou                   |
| O02 | POST /api/v1/off-peak/ticket                                 | Vínculo de conta/projeto do tíquete resgatado é preservado                | JWT existente + Project Token             | Regressão de tempo ocioso passou; backend real não executado                |
| O03 | POST /api/v1/off-peak/ticket/status                          | O polling de status resolve novamente as credenciais atuais              | JWT existente + Project Token             | Regressão de tempo ocioso passou; fila real cruzando TTL não executada       |
| O04 | POST /api/v1/off-peak/ticket/{id}/settle                     | Contrato de liquidação e idempotência é preservado                        | JWT existente + Project Token             | Regressão de tempo ocioso passou; backend real não executado                |
| O05 | POST /api/v1/off-peak/anthropic/v1/messages                  | Reutiliza cabeçalhos de tíquete e Token de negócio                      | Project Token + contexto de tíquete existente | Entrada de requisição compartilhada; inferência real não executada       |
| A01 | Aceleração / Start Plan / MCP oficial / reset                | Mantém o canal de JWT de login existente; as partes que consomem credenciais de pacote passam a usar Token | Resolução pelo canal existente | Regressão de aceleração/reset/serviço de autenticação passou; ponta a ponta não executado |
| C01 | Login OAuth/modelo/logout no Standalone                      | source=oauth não lê a Key antiga; identidade estável; logout rejeita Token tardio; manual independente | JWT de login → Project Token        | Passaram 19 testes de adapters da CLI e 24 de bootstrap                    |
| R01 | Autenticação de requisição em desktop/celular/workspace remoto | Mesmo owner de Host e fronteiras continuous/replayable originais          | Canal privado de autenticação de requisição | Criação/troca de credencial no desktop passaram; E2E do celular não executado neste ciclo |

A tabela final de testes de interfaces deve registrar método/caminho, origem das credenciais antes/depois da mudança, dados de teste, esperado, resultado real, evidências e motivo de não verificação.
Evidências dos ciclos anteriores: 21 arquivos de camada comum/serviço com 304 testes aprovados; 19 de adapters da CLI e 24 de bootstrap, total de 43 testes aprovados; 2 E2E de criação/troca de Token no desktop aprovados (a primeira execução teve timeout de startup do WebDriver e passou na repetição com limite de 90 s para o request de startup).
E2E runId: desktop-e2e-20260923035859355-p42258-c98f5ad1034a9175.
typecheck/lint/architecture da raiz e typecheck da CLI aprovados. O lint completo da CLI ainda tem falhas existentes de max-lines; o baseline de auth-login.ts já passa de 400 linhas e este ciclo não eliminou o problema. `test:unit:affected` só lê as diferenças já commitadas e foi pulado porque o HEAD não mudou, portanto não vale como evidência de testes unitários deste ciclo. A semântica e os parâmetros das interfaces foram validados por regressão com mock; não se declara que a emissão de Token/chamada de modelo/E2E do celular em produção real foi aprovada.
A validação necessária segue o AGENTS.md da raiz e da CLI; ainda há problemas de baseline de lint na CLI, então verificações com falha não são commitadas automaticamente.

### Reteste das correções de compatibilidade da Key dedicada (2026-09-23 12:34)

Neste ciclo, 8 arquivos de camada comum/serviço com 145 itens, 20 itens de auth da CLI e 24 de bootstrap, total de 189 itens aprovados; inclui 11 novos testes de fronteira da Key dedicada e a regressão de seleção de projeto misto da CLI. As 8 combinações existente/criação de pessoal/equipe nas duas families ganharam asserções de cabeçalho de requisição por estágio.

2 E2E de desktop aprovados: desktop-e2e-20260923043115034-p70752-f786c1770da8630d.
typecheck, lint e architecture da raiz e typecheck da CLI aprovados. O lint completo da CLI ainda tem os erros existentes de max-lines.
O script de teste dos adapters executou ainda o pacote inteiro: 130 arquivos aprovados e 4 com falha, 2015 itens aprovados, 51 com falha e 4 pulados, mais uma falha de importação de suíte; isso não pode ser considerado aprovação total. O snapshot do código no HEAD anterior reproduz essas falhas (configuração de modelo, expectativas antigas da verificação de segurança e módulo catalog ausente), e este ciclo não ampliou o escopo para corrigir esses problemas de baseline.
Logs de evidência: /tmp/key-contract-green.log, /tmp/key-contract-cli-auth.log, /tmp/key-contract-cli-bootstrap.log, /tmp/key-contract-e2e.log, /tmp/key-contract-cli-green.log, /tmp/key-contract-baseline-tests.log, /tmp/key-contract-baseline-wire.log.

### Reteste da verificação completa de dependências de Keys antigas (2026-09-23 15:08)

Cobriu recuperação OAuth no desktop, snapshot/autenticação de requisição da CLI, uso pessoal e de equipe, decisão na UI, Provisioning remoto, montagem do serviço de anexação remota antiga, cache de Token e verificação de segurança. 31 arquivos relevantes com 506 itens aprovados; a montagem do serviço remoto, após adicionar o cenário de equipe, teve 10 itens aprovados em reteste independente (com sobreposição ao ciclo anterior, sem somar). 3 arquivos de bootstrap da CLI com 27 itens aprovados.

| Cenário                                | Esperado e evidência                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| OAuth válido, Key antiga ausente ou indecifrável | Snapshot/requisição da CLI com sucesso; Z.AI do desktop recupera na cold start e troca a credencial, sem novo login, e o registro antigo não muda |
| Key manual explícita, com OAuth corrompido | Lê apenas a Key manual, com autenticação independente                                                          |
| Sincronização remota com Key antiga corrompida no local ou no remoto | Sincroniza apenas OAuth; Key de envelope antigo ignorada; registro antigo original não é sobrescrito nem apagado |
| Uso pessoal/equipe com anexação remota   | Reutiliza o owner original se existir; sem owner, usa o fluxo real de troca de credencial; quota header é o Token de teste, Copy=0 |
| Disponibilidade na UI e falha de Token  | Mantém as validações de benefício/ID/credencial da requisição; sem barreira de existência de Key antiga e sem fallback em falha |

2 E2E finais de desktop aprovados: `desktop-e2e-20260923070315610-p85476-12717808333f5136`, cobrindo BigModel sem Key antiga, Z.AI com Key antiga corrompida na criação/troca de credencial e Copy=0. typecheck/lint/architecture da raiz, typecheck da CLI e typecheck de E2E aprovados. O lint da CLI e as falhas de baseline de testes do pacote inteiro citadas acima continuam sem solução, portanto ainda não se faz commit/push/MR. Inferência com backend real, E2E do celular e versões mistas no remoto não foram verificadas.
Logs: `/tmp/key-audit-broad.log`, `/tmp/key-audit-remote-final.log`, `/tmp/key-audit-cli-green.log`, `/tmp/key-audit-e2e-final.log`.

### Revisão de logout na CLI (2026-09-23 15:23)

Nova descoberta e correção do problema de o logout descriptografar em lote Keys históricas: apenas `manual` explícito lê e remove condicionalmente a Key privada; Keys antigas de OAuth/sem origem não são lidas nem removidas. As duas regressões de logout com ciphertext corrompido falharam antes e passaram depois. O arquivo de login foi separado em contrato e persistência conforme a especificação, a entrada principal ficou com 352 linhas e as exportações públicas não mudaram; o lint dos arquivos da CLI modificados neste ciclo não tem erros. Ao final, 4 arquivos da CLI com 32 itens aprovados, typecheck da raiz e da CLI e lint/arquitetura da raiz aprovados. A CLI completa ainda tem falhas históricas de max-lines em arquivos não alterados; o limite excedido em auth-login.ts citado acima foi resolvido.

### Validação após o rebase (2026-09-23)

origin/staging foi sincronizado até `4f97793bc6`, restaurando todos os 51 arquivos alterados; o único arquivo mesclado automaticamente foi services/node.ts, e tanto a correção de CUA do upstream quanto a montagem de Token deste ciclo foram preservadas, sem conflito. Após o rebase, o typecheck da raiz e a regressão de 22 itens em 4 arquivos de conta/remoto passaram. Os resultados dos ciclos anteriores e os itens não verificados continuam separados conforme o registro acima; o commit não indica que as falhas históricas de baseline da CLI foram corrigidas.

## Identidade de conta em agent/configs

GET `/api/v1/agent/configs` não envia mais `x-api-key` nem Authorization de login/PAT. O pacote da conta usa o `apiKeyId` real retornado pela mesma troca de credencial, enviado via `x-api-key-id`; não se pode renomear o PAT e colocá-lo no Header de ID, nem derivar o ID do PAT/Key manual. Providers manuais não enviam Key nem Key ID e ainda assim podem ler a configuração pública.

```text
owner de autenticação do Host local / SSH Server / CLI independente
  └─ a troca de credencial da plataforma retorna { token, apiKeyId }
       └─ requestAuth do momento da requisição (validação estrita de protocolo)
            ├─ token → autenticação do modelo
            └─ apiKeyId → agent/configs: x-api-key-id
Provider manual → agent/configs: sem Header de credencial
```

O ID é transportado apenas com o material de autenticação do momento da requisição, não é escrito na configuração estática do modelo nem adicionado aos Headers da requisição do modelo; retries reaproveitam a verificação de identidade do owner atual. O cache de roteamento continua sendo um mapa comum em nível de processo, com cooldown de cinco minutos em sucesso e trinta segundos em falha; acerto de cache não requisita a configuração novamente. O upstream removeu a requisição do interruptor de verificação de segurança: o Provider manual usa diretamente a lógica padrão de verificação de segurança, e apenas a configuração de roteamento lê agent/configs, sem enviar a Key manual. Desktop e SSH compartilham o serviço de autenticação Host/Server; o celular reaproveita o host existente, e a semântica de mensagens continuous/replayable não muda.

Aceitação: pessoal/equipe e BigModel/Z.AI retornam o ID pareado com o PAT; a CLI independente em OAuth retorna ID e o login manual não tem ID; o ida e volta do protocolo preserva o ID; a requisição de configuração contém apenas o ID real, e a requisição do modelo ainda contém o PAT e nenhum Header de ID; a requisição de configuração de roteamento de um Provider manual não vaza Key, e a lógica de verificação de segurança não requisita mais o interruptor de configuração; novas requisições após troca de credencial/troca de conta usam o ID correspondente.

Validação desta rodada: regressão de serviço/Host com 76 itens, 201 itens específicos da CLI e 1 item de propagação de ID pelo protocolo aprovados (278 no total, incluindo verificação de Headers reais via HTTP local). typecheck da raiz, verificações de lint e architecture e a verificação de tipo independente de contracts/adapters/bootstrap da CLI passaram. A entrada principal da CLI não tem turbo; o lint completo dos três pacotes tem 50 erros existentes de max-lines, e os arquivos alterados passam quando essa regra de estoque é excluída. Na execução ampliada houve também 3 falhas de testes antigos de verificação de segurança e 2 de protocolo antigo, reproduzidas com os testes/implementação do HEAD e não contadas entre as aprovações deste ciclo. A plataforma real e o ambiente SSH ainda não foram integrados; é preciso usar o Host/Server e o Agent pareados que incluem o protocolo privado com apiKeyId.