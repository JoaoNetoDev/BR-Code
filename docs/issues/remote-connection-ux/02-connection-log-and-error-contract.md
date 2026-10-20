# 02 — Log de conexão e contrato de erros

Status: done

**Spec pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:** nenhum, pode começar imediatamente.

**Comportamentos a entregar:**

- **Log limpo e legível**: durante a conexão, o log visto pelo usuário contém apenas o conteúdo desta conexão, e já está sanitizado.
- **Falha com resultado**: quando a conexão é recusada, dá timeout ou o host não é encontrado, a interface exibe um erro em chinês em tempo razoável, sem ficar presa em "Conectando".
- **Log consultável após a falha**: mesmo que o assistente seja fechado depois da falha, ainda é possível ver na página de configurações, no cartão do dispositivo, o log da última conexão ou atualização deste dispositivo.

Isso corresponde à parte de contrato de "classificação de erros de conexão" e à seção "Log de conexão e log de operações" da spec pai.

Escopo:

- **Escopo de encaminhamento**: o contexto de progresso da conexão encaminha apenas os logs que o pipeline de conexão reporta ativamente. Outros logs periféricos emitidos por outros serviços no mesmo contexto assíncrono nunca entram no log visível ao usuário, como o conteúdo completo das configurações impresso pelo serviço de configurações ao gravar a configuração.
- **Sanitização**: remover uniformemente caminhos absolutos locais, tokens, referências a credenciais e identificadores de dispositivo. Os logs anexados ao feedback usam o mesmo resultado filtrado.
- **Nível de log**: a espera por confirmação do usuário para instalar é registrada como info, não como error.
- **Contrato de códigos de erro**: estender o conjunto de códigos de erro.
  - Cobrir estes casos: conexão recusada ou host inalcançável, timeout, host não encontrado, mudança da chave do host (quando detectável de forma confiável), falha de download, falha de upload, falha na verificação prévia, falha de instalação, espaço ou permissões insuficientes no remoto, cancelamento pelo usuário, desconhecido.
  - Os tipos compartilhados e o schema de runtime são atualizados em sincronia.
  - `AggregateError` adota o código de erro interno.
  - Quando a mensagem está vazia ou não é reconhecível, classificar como "desconhecido". A resposta do host não pode ser descartada por falha na validação de schema.
- **Transição dos textos de erro**: os novos códigos de erro entram primeiro no mapeamento de textos de erro existente, e o texto precisa existir em chinês e em inglês. A exibição completa por categoria fica a cargo de [03](./03-presentation-model-states-and-glossary.md).
- **Log das últimas operações**: a camada de serviço mantém, por dispositivo, o log de operações da última conexão ou atualização, e adiciona uma interface de consulta. O log é mantido apenas na memória desta execução, com limite de linhas e isolamento entre dispositivos. O cartão do dispositivo na página de configurações oferece a entrada "Ver log recente".

Critérios de aceitação:

- [x] **O log não vaza**: durante todo o processo do contêiner de teste de conexão, o log visível ao usuário e os anexos do feedback nunca contêm o conteúdo das configurações, o caminho local do projeto, o perfil de conexão nem o identificador do dispositivo. Exige teste na camada de contrato do processo principal/host, e o E2E também deve afirmar.
- [x] **A espera por confirmação não aparece como erro**: enquanto se aguarda a confirmação de instalação, o nível de log é info e a interface não mostra o erro em vermelho.
- [x] **Conexão recusada não fica pendurada**: ao conectar a uma porta não ocupada, o erro em chinês "Não foi possível conectar ao host" é exibido em até 5 segundos.
  - Fazer teste de camada de contrato com `AggregateError` e com falha de mensagem vazia, afirmando que se obtém um código de erro já classificado, mensagem não vazia, e que a resposta do host passa na validação de schema.
- [x] **Timeout e host não encontrado**: cada um devolve seu código de erro e o texto em chinês correspondente; a UI recai no texto genérico quando encontra um código de erro desconhecido.
- [x] **Sincronia dos dois lados**: os tipos compartilhados e o schema de runtime são estendidos em sincronia, e o resultado da validação é o mesmo no lado do App e no lado do host.
- [x] **Log consultável após a falha**: depois de fechar o assistente, ainda é possível ver no cartão do dispositivo na página de configurações o log da última conexão ou atualização deste dispositivo; os logs de múltiplos dispositivos não se misturam. Exige teste da camada de serviço e teste de componente.
- [x] **Atualizar o documento de fatos**: no documento de fatos da cadeia principal remota, os trechos sobre log de conexão, códigos de erro e log de operações passam a refletir o comportamento mais recente.
- [x] **Verificações obrigatórias**: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e o E2E de SSH afetado passam todos, e só então o commit local é feito.

## Registro de verificação (2026-09-27)

- Implementado e aprovado pela revisão nos dois eixos de spec/especificação; o closure de reconexão automática preservado e o crosstalk de logs na troca de identidade encontrados na revisão foram corrigidos e voltaram a ser testados.
- `pnpm typecheck`, `pnpm lint` e `pnpm architecture:check --changed` passaram; 251 casos em 15 arquivos de testes unitários relacionados passaram, cobrindo concorrência/saída tardia, o limite de 100 linhas por dispositivo, troca de identidade, schema do Host e reconsulta ao reabrir o componente. Os avisos pré-existentes do lint não foram ampliados nesta ticket.
- Validação com contêiner SSH real: nova tentativa após senha errada, primeira instalação, seleção de diretório, filtragem de log durante todo o percurso, e falha em chinês em até 5 segundos em porta não ocupada com o feedback pré-preenchido; a última rodada passou 2/2 (artifact `remote-log-contract-20260927-verified`). Os screenshots de tema claro e escuro e de 1400/480px foram conferidos; 480px é validação responsiva do desktop, e não equivale a um aparelho real com replayable. O novo RDUX-LOG permanece pending, sem conversão automática para humano.
- **Limitação da verificação completa**: a execução completa de `pnpm test:unit` exigida pela skill de implementacao apresentou falhas em módulos não alterados e travamento de worker, e foi interrompida depois de mais de 15 minutos. Reproduzidos isoladamente dois casos de falha em `packages/services/test/repoSnapshotUploadTransport.test.ts:133`: `ReferenceError: mode is not defined`, com o mesmo código na baseline HEAD; `autoUpdaterReadyState.test.ts` ainda não sai em execução isolada com threads/forks. Esta ticket não modificou esses módulos; ciente das limitações acima, o usuário autorizou explicitamente o commit local.
- A validação de fixture do novo pending case na auditoria global de coverage passou; a auditoria completa falhou por referências de baseline D19/I74/I75, estatísticas existentes e documento gerado desatualizado. A checagem de fixture do novo case desta ticket e a checagem de tipos do E2E passaram.
