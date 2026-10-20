# Spec de persistência local do registro de onboarding

> Branch: `prototype/onboarding-suggestions`
> Status: implementado (fase de armazenamento local; interface de upload para o servidor pendente, com `uploadState` reservado)

## 1. Contexto e objetivos

O onboarding de novos usuários (OccupationOnboarding, assistente de três passos: profissão / modo / preferências) hoje, ao ser concluído, grava apenas as preferências em `~/.zcode/v2/setting.json` (campos como `onboardingOccupation`), sem um "registro de conclusão do onboarding" independente.
O produto precisa de:

1. persistir as informações coletadas nas três páginas em um **arquivo JSON local separado**, para depois habilitar o upload ao servidor;
2. ancorar o registro por **device id (deviceMid)**, com suporte a **múltiplos user ids** (várias pessoas conectadas no mesmo computador),
   e também a **ausência de user id** (uso com apikey, não conectado);
3. exibir o onboarding automaticamente apenas para identidades ainda não ativadas nesta máquina: quando não há resposta/decisão de elegibilidade nem Task/Session reais criados; usuários existentes com Tasks locais são registrados silenciosamente como `existing_local_user` e usuários que fecharam o onboarding como `dismissed` — ambos não são exibidos novamente.

## 2. Estrutura de dados

O schema está definido em `packages/shared/src/onboardingRecord.ts` (tipos + zod, em um arquivo separado e par, sem incorporação a `validationAppSettings.ts`):

```ts
interface OnboardingRecordEntry {
  userId: string | null; // OAuth user_id；apikey/未登录为 null
  occupation: string; // developer | ... | other（非空字符串，向前兼容）
  interfaceMode: "coding" | "office";
  memoryEnabled: boolean;
  proactiveSuggestionsEnabled: boolean;
  completedAt: string; // ISO 时间
  uploadState: "pending"; // 预留：上传成功后改 "uploaded"
}

interface OnboardingRecordFile {
  version: 2;
  deviceMid: string; // 首次写入时固化，之后不变
  entries: OnboardingRecordEntry[]; // 每 userId（含 null）至多一条，重复完成引导覆盖旧条目（覆盖后重置为 pending 等待上传；读取侧兼容旧版重复文件取最后一条）
  decisions: Array<{
    userId: string | null;
    status: "dismissed" | "existing_local_user";
    reason: "user_closed" | "existing_local_task";
    decidedAt: string;
  }>;
}
```

`entries` continuam sendo as respostas do questionário e a fila de upload subsequente; `decisions` expressam apenas a elegibilidade de exibição local e não entram no upload de respostas.
Arquivos v1 não recebem migração na inicialização: na leitura são tratados como `decisions: []` e, na próxima escrita de negócio, são naturalmente gravados como v2.

**Semântica de pulo**: pular é uma resposta explícita. Quando uma página é pulada, o campo correspondente é registrado como `null` (pulo na página de profissão → `occupation: null`; pulo na página de modo → `interfaceMode: null`; pulo na página de preferências → os dois booleanos como `null`), diferenciando-se de "escolheu explicitamente um valor". No lado de settings, o pulo continua gravando o default conservador (profissão `other` / preferências desligadas); a distinção aparece apenas neste arquivo de registro.

Local de armazenamento: `getAppConfigDir()/onboarding-record.json` (isto é, `getDataBaseDir()/.zcode/v2/`, por padrão `~/.zcode/v2/`; quando o usuário define um diretório de dados customizado, segue o dataBaseDir, igual a dados de nível de dispositivo como telemetry-state.json. Note a diferença em relação a setting.json — setting.json permanece fixo no home, porque o onboarding de inicialização precisa ler o dataBaseDir de uma posição fixa). Escrita atômica.

## 3. Semântica de vínculo

```
+----------------+          +---------------------------+
| deviceMid      |<---------| onboarding-record.json     |
| (本地稳定不变)  |          |  version: 2                |
+----------------+          |  entries: [                |
                            |    { userId: "u1", ... },  |  用户 A 登录完成引导
                            |    { userId: "u2", ... },  |  用户 B 之后登录完成引导
                            |    { userId: null, ... },  |  未登录/apikey 完成引导
                            |  ]                         |
                            +---------------------------+
                                           |
                                           | 后续上传（接口待定）
                                           v
                                  服务器（payload 自带 deviceMid + userId）
```

- `deviceMid` é passado pelo renderer via `platform.getDeviceId()` (no desktop, SHA-256 do caminho userData, estável) para o service; após ser gravado, o valor **dentro do arquivo** é o autoritativo e reescritas não o alteram.
- `userId` é completado internamente pelo service via `oauthCredentialRepo.loadActiveUserProfile()?.id ?? null`; a UI não toca diretamente na camada de OAuth.

## 3.5 Reivindicação no login (claimAnonymousRecord)

Responder uma vez sem estar conectado e depois conectar não pode ser tratado como um novo usuário que precisa de onboarding repetido: antes de avaliar o usuário conectado, primeiro se reivindica o registro — quando esse userId não tem entrada mas existe uma entrada anônima (null), a entrada null é **transferida** para aquele userId (reescrita, não cópia, evitando que o mesmo comportamento de onboarding produza duas entradas e contamine as estatísticas de upload).

```
[] → 未登录答 → [null]
  → 登录 A：移交 → [A]（不再触发引导）
    → 登出答（匿名）→ [A, null]
      → 登录 B：B 无条目 → 移交 null → [A, B]
        → 切回 A：A 有条目 → 不动
```

- a reivindicação cobre simultaneamente a entry de respostas e a decision de elegibilidade, e ocorre somente quando o próprio usuário conectado não tem nenhuma das duas; no estado [A, null], conectar com A é uma operação vazia idempotente.
- após perder o registro no estado anônimo, o onboarding disparar novamente é o comportamento esperado (esse estado realmente não tem registro próprio).
- no lado da UI é obrigatório aguardar a reivindicação terminar antes de shouldOnboard, caso contrário a leitura do arquivo anterior à reivindicação pode concluir incorretamente que o onboarding é necessário.

## 4. Regras de disparo (shouldOnboard)

```
启动 / 登录态变化（zustand user 改变）
        |
        v
 resolve userId = loadActiveUserProfile()?.id ?? null
        |
        v
 entries 或 decisions 存在 userId 匹配 ? -- 是 --> 不触发
        | 否
        v
 本机存在使用证据（任一命中即存量用户）？ -- 是 --> 写 existing_local_user，不触发
        | 否
        v
 触发引导（完成写 entry；关闭写 dismissed）
```

- usuários conectados fazem correspondência exata por `userId`; não conectado / apikey faz correspondência por `userId === null`.
- **A evidência de uso (revisão de 2026-10) é julgada por "qualquer hit"**, com três fontes verificadas em ordem:
  1. o tasks-index global do dispositivo contém qualquer Task (`includeDeleted: true`, incluindo o tombstone de Tasks já deletadas — um usuário existente que limpou a lista de tarefas não perde a elegibilidade por causa da exclusão);
  2. o banco de sessões do agent (padrão `~/.zcode/cli/db/db.sqlite`, expandido por homedir, não migra junto com o dataBaseDir; as regras de override por env/configuração e de pulo para fonte não espelhável estão no item abaixo; consulta SQLite somente leitura na tabela `session` verificando se existe pelo menos uma linha);
  3. o diretório de snapshots de tarefas da versão antiga (`{dataBaseDir}/.zcode/v2/sessions/`, incluindo `.deleted.json`) não está vazio.
- **Por que não consultar apenas o tasks-index**: o índice é uma projeção derivada do sincronizador de sessões, que só começa a preencher depois que o agent/provider está pronto; a decisão ocorre justamente quando o login termina e a interface principal é montada, antes do preenchimento. Índice vazio ≠ ausência de histórico (caso em produção de 2026-10: após a reconstrução do índice no diretório de dados dev, a decisão no instante do login enxergou um índice vazio e exibiu o onboarding indevidamente a um usuário antigo; a apuração posterior confirmou que todas as linhas históricas de tarefas estavam no WAL e só foram gravadas depois da decisão).
- **A evidência de sessão precisa consultar as linhas do banco de sessões, não a existência do arquivo nem o diretório cli/sessions** (revisão CR-01): a existência do arquivo não implica existir sessão (banco vazio/recém-criado); `cli/sessions` é o diretório de saída de arquivos de workflow (`script-workflow-tool-port.ts`), e usá-lo como evidência faria um usuário novo que usou workflow ser julgado como usuário existente.
- **O caminho do banco de sessões espelha apenas as fontes de localização que o host consegue copiar de forma determinística; quando não é possível determinar, pula como "desconhecido"** (revisão CR-01 terceira rodada: não replicar no host as regras completas de resolução do CLI — caminho relativo é resolvido pelo cwd do workspace do agent, configuração de nível de projeto é sobreposta por workspace, e o host não consegue espelhar nenhum dos dois). Fontes espelháveis, por ordem:
  1. env `ZCODE_SESSION_DB_PATH` / `ZCODE_SESSION_DB` (com os dois aliases coexistindo, prevalece o último pela ordem das chaves do env, em coerência com a ordem de override do env adapter do CLI);
  2. `storage.sessionDbPath` de `~/.zcode/cli/config.json` (o user config padrão do CLI `createConfig` fica no home, **não migra junto com o dataBaseDir do App**);
  3. o padrão `~/.zcode/cli/db/db.sqlite` (`~/` expandido por homedir).
     Só um valor absoluto (incluindo `~/` expandido) vale como local da evidência; caminho relativo → desconhecido → pula esta fonte de evidência (segue verificando o diretório de snapshots antigo) e nunca adivinhar pelo cwd do host. Falha na leitura/parsing da configuração (que não seja ENOENT) sobe: sem a configuração o local do banco de sessões é desconhecido, e adivinhar o padrão deixaria passar usuários existentes com banco de sessões customizado.
- o banco de sessões é consultado com conexão somente leitura, e as linhas no WAL ainda não checkpointed também são visíveis para a conexão somente leitura, sem relação com o timing do preenchimento; arquivo de banco inexistente (stat ENOENT) é tratado como ausência de evidência, **outras exceções (EACCES/ENOTDIR etc.) sobem**, e a UI julga conservadoramente que não exibe (revisão CR-02: existsSync engole erro de permissão como false, violando o convênio "resultado desconhecido não exibe").
- a versão atual não tem atribuição confiável de identidade do criador da Task, portanto qualquer fonte que acerte faz com que a identidade sem registro seja tratada como usuário existente.
- a abertura manual do onboarding por atalho (`newUserOnboardingOpen`) não é restringida por essa regra e também acrescenta um registro ao salvar.

## 5. Interface de serviço (IOnboardingRecordService)

| Método                             | Descrição                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `appendRecord(deviceMid, entry)` | Cria o arquivo e fixa o deviceMid se não existir; acrescenta se existir; em caso de corrupção, emite warn e reconstrói; o userId é completado pelo serviço |
| `shouldOnboard(deviceMid)`       | Avaliação de disparo; grava existing_local_user quando já há Task (ver §4)        |
| `dismissOnboarding(deviceMid)`   | Grava dismissed ao fechar o primeiro onboarding; é operação vazia se já houver respostas |
| `getRecords()`                   | Lê o arquivo inteiro (usado no upload subsequente)                                |
| `clearRecords()`                 | Remove o arquivo (para depuração)                                                  |

A cadeia de exposição de RPC é a mesma do settingService: `ServiceChannels.OnboardingRecord` →
descriptor → registro em `createLocalServices` → getter de `RemoteServiceAccess` → hook de UI.

### 5.1 Conexão de serviço do workspace remoto no celular

A coleção de services do workspace remoto deve expor `onboarding-record`, mantendo a mesma origem dos services de settings/OAuth desse ponto de entrada. No R3, SSH/WSL/Docker e Server passam uniformemente pelo encaminhamento total do Source Server ([spec principal do R3 §8.1](./architecture/r3-source-server-remote-architecture.md#81-权威表)); como settings/OAuth são mantidos pelo Source, os quatro transports encaminham para o serviço de registros do próprio Source; não se deve tomar emprestado o registro do Local Host da janela, nem criar um serviço de registro por projeto nem copiar registros.

```text
手机新建远程任务 -> 新 workspace attachment -> 手机 allowlist -> onboarding-record RPC
  SSH/WSL/Docker/Server -> Source 原有服务 -> Source 身份（Provisioning 下发的 OAuth）、记录和任务索引
```

`onboarding-record` pertence aos channels obrigatórios do `RemoteWorkspaceRpcContract v1` e está dentro do allowlist de attachment `web-remote-replayable`; quando falta a liberação, a chamada do celular expira, com efeito equivalente ao de não registrar o canal.

A causa da falha foi a coleção de services remota não registrar este canal: após o celular remontar o Root a chamada falhava e caía na decisão baseada em settings, exibindo o onboarding indevidamente. A correção apenas completa a montagem do serviço; as regras de disparo do onboarding, o fallback de falha de settings, a remontagem do Root e a semântica de transferência de Tasks de desktop-continuous/web-remote-replayable seguem a implementação existente.

Cobertura de regressão: quando já existe registro mas settings não tem o campo de profissão, o celular entrando em um rascunho remoto não exibe o onboarding; o usuário de primeira execução continua vendo, e após fechar, reconectar mantém o estado fechado; a coleção remota usa o serviço de registros do Source e não pode ler registros do desktop por engano. O teste de montagem de serviços valida o roteamento de leitura/escrita e a propagação de erros via RPC real; a regressão de navegador usa componentes reais de onboarding, montagem de serviços e allowlist do celular, com entrada de tarefa e ambiente de transferência em fixtures isoladas, não substituindo a validação de pareamento em aparelho real e a transferência ponta a ponta por SSH/WSL/Docker.

- Regressão de RPC: `packages/desktop/test/hostRemoteWorkspaceServices.test.ts`,
  `packages/desktop/test/windowHostAttachmentRpcPolicy.test.ts`.
- Caso de navegador candidato (aguardando revisão manual):
  `packages/desktop/test/e2e/manual-review/pending/mobile-remote-onboarding.mjs`,
  executando a partir da raiz do repositório `pnpm exec tsx <caminho-do-caso>`.

## 6. Integração de UI (OccupationOnboarding.tsx)

- Os textos das ações do onboarding devem estar totalmente definidos nos pacotes de idioma zh e en, sem voltar a exibir a chave de tradução original:
  `start` é "开始使用" / "Get started", `continue` é "下一步" / "Next",
  `saving` é "正在保存…" / "Saving…", `back` é "返回" / "Back",
  `error` é "保存失败，请重试。" / "Failed to save. Please try again.".
  Os testes de regressão cobrem essas cinco chaves nos dois idiomas, garantindo que a telemetria posterior possa reutilizar textos de botão válidos.

- A navegação superior usa colunas laterais de largura igual e uma coluna central de progresso: voltar à esquerda, progresso das etapas exatamente ao centro, fechar à direita, botões centralizados verticalmente e com margens externas iguais; no primeiro passo o botão voltar é ocultado mas sua coluna é mantida, sem deslocar o progresso.

- Os ícones das opções de profissão usam 20px (size-5) e o círculo de seleção permanece com 16px.
- Os botões pular e próximo unificam o tamanho de fonte em text-ui-base (14px por padrão).

- Layout: as duas colunas da versão desktop recebem, de fora para dentro, 4px de respiro em todos os lados e o espaçamento entre colunas; o painel ilustrado à direita reaproveita as regras de raio de canto da interface principal
  (Windows 5px, macOS 26+ 12px, macOS antigo ou desconhecido 6px, outras plataformas 12px).
  Os cartões de seleção de profissão, modo e preferências à esquerda usam uniformemente o raio do contêiner de primeiro nível rounded-xl; nesta página, por exigência de design, os botões próximo, anterior, pular e fechar são uniformizados em rounded-xl, em coerência com os cartões de seleção, sem modificar o raio de canto padrão global dos botões.
  O Hero à direita cobre a borda de tema de 1px, mantém o raio do painel, não ocupa espaço de layout e não recebe ponteiro.
  O Hero usa um layout de apresentação de marca alinhado à esquerda: Logo, título e subtítulo compartilham a margem esquerda, o grupo de conteúdo é centralizado verticalmente e a largura máxima é de 640px.
  O respiro lateral do painel varia entre 64–72px conforme a largura da janela e o respiro vertical permanece em 32–72px; o espaçamento entre Logo e título é de 40px e entre título e subtítulo é de 24px.
  Em telas estreitas vale o formulário de coluna única e os limites de rolagem originais, sem exibir o Hero; em janelas curtas o painel pode rolar.
  Os textos do Hero usam tamanhos de fonte próprios a esta página, conforme o design: o título varia entre 24–48px conforme a largura da área de conteúdo, peso semibold e entrelinha de 1.15, permanecendo em uma linha; o subtítulo usa 16px com entrelinha de 26px, e as duas frases em inglês têm quebra de linha explícita após o ponto, mantendo quebra natural de frases longas em janelas estreitas, sem escalar com o tamanho de fonte da UI; o título mantém a cor de texto do tema do Hero e o subtítulo escuro usa um azul-acinzentado claro para aumentar o contraste.
  Os textos do Hero se alinham ao título de marca do site oficial: em inglês "Simple, Fast, Vibe‑Ready!" e em chinês "简单、迅捷、氛围十足！"; o subtítulo gira em torno de agentes múltiplos alcançando objetivos complexos e controle em qualquer lugar, em uma versão curta adequada ao painel de onboarding.
  O grupo de conteúdo reaproveita diretamente o componente de ícone de marca da página de inicialização (incluindo tamanho, fundo com gradiente preto, traço e raio), sem inversão entre temas claro e escuro; a página de onboarding desliga as animações, a página de inicialização mantém as animações originais.
  O fundo preto do Logo de onboarding e o Z branco permanecem estáticos, com apenas um brilho suave varrendo dentro de uma borda de 1px com raio; a cauda de luz cobre cerca de 120°, completa uma volta em 5 segundos, com cauda suave e sem gerar halo periférico; o brilho varrido é ocultado quando há redução de movimento.
  O fundo referência apenas os valores de cor azul do tema do Hero da área de boas-vindas (no escuro, azul-escuro e azul-ciano; no claro, branco-azulado de gelo e azul-céu),
  sobrepondo um campo de luz WebGL fluido de implementação independente (referência na direção visual do Mesh Flow 6, não o código oficial de preset), mantendo o fluxo, a opacidade e a velocidade originais e trocando apenas a cor de fundo e o RGB das fitas de luz; não se sobrepõe o halo estático nem o modo de mistura do Hero.
  As linhas de órbita foram removidas. A onda principal completa um ciclo a cada ~3 segundos; o fundo não recebe ponteiro e é executado apenas no painel visível da área de trabalho, com no máximo 24fps e lado maior de renderização não superior a 960px. Com movimento reduzido o quadro é fixo; a ocultação da página pausa; a desmontagem libera a GPU e os recursos de escuta;
  quando o WebGL está indisponível ou o contexto é perdido, exibe-se a cor de fundo estática do tema, sem bloquear o onboarding.
  A aceitação cobre desktop de tela grande, janela curta e largura de celular, nos temas claro e escuro, sem que o conteúdo transborde ou cubra a navegação.

- Gating de exibição: `requested || (needsOnboarding === true && !dismissed)`;
  `needsOnboarding` é o resultado da avaliação assíncrona. **A avaliação não pode bloquear a interface principal indefinidamente**: usuários existentes
  (com `onboardingOccupation` já em settings) entram na interface principal sem esperar a avaliação; usuários provavelmente de primeira execução esperam no máximo
  3 segundos. `appendRecord` também tem timeout de 5 segundos, e a ausência do canal
  não deixa o botão de salvar girando indefinidamente.
- Semântica da avaliação de fallback (revisão de 2026-10):
  - **Timeout de 3 segundos → julga conservadoramente "não precisa de onboarding"**. A implementação original, no timeout, voltava à decisão via settings, mas o closure de fallback era avaliado na primeira execução do effect, e na primeira execução as settings necessariamente ainda não estão carregadas (`useSettings` começa como null), de modo que o valor de fallback era sempre "precisa de onboarding" — o cold start em que a RPC de avaliação passou de 3 segundos (congestionamento de inicialização, primeira abertura lenta do SQLite do tasks-index, cadeia ws/relay lenta) exibia indevidamente o onboarding a um usuário antigo, e o resultado real, ao chegar, fazia o onboarding sumir, já tendo contado como exposição na telemetria. O timeout significa apenas "resultado desconhecido" e não pode, por isso, incomodar o usuário; o resultado real, ao chegar, sobrescreve normalmente (para um usuário realmente novo o onboarding apenas aparece alguns segundos depois, e a interface principal entra antes).
- **Falha de avaliação (rejection) ou serviço indisponível → sempre julga conservadoramente "não precisa de onboarding" (segunda revisão de 2026-10)**.
  A implementação original voltava à decisão via settings (`!onboardingOccupation`), mas esse fallback julgava "precisa de onboarding" um usuário antigo que nunca preencheu o onboarding — em conflito com "usuários antigos nunca veem o onboarding" —, e o snapshot de settings na primeira execução do effect necessariamente ainda não estava carregado, o que historicamente já causou exibição indevida a partir de snapshots obsoletos. A falha significa apenas "resultado desconhecido" e não pode, por isso, incomodar o usuário; no pior caso, um usuário realmente novo só vê o onboarding na inicialização seguinte (mesmo custo do caso de timeout).
- **As settings não participam mais da avaliação de fallback**: `settingsLoaded` / `onboardingOccupation` são removidos do hook de disparo, e as dependências do hook são reduzidas ao serviço de record, userId e deviceMid. O `onboardingOccupation` das settings continua sendo usado apenas para a liberação de UI dos "usuários existentes que não esperam a avaliação" (gating de exibição em §6) e para o conteúdo da área de recomendações, e deixa de ser a fonte de verdade sobre a elegibilidade para o onboarding.
- **O orçamento de liberação de 3 segundos é separado das rodadas de avaliação**: as reexecuções da avaliação disparadas pelo carregamento das settings ou por mudança de identidade (userId / instância do serviço de record) apenas atualizam o contexto da avaliação, sem conceder novamente tempo de bloqueio da interface principal. O instante-limite é estabelecido na primeira rodada de avaliação pendente e compartilhado entre as rodadas; as reexecuções usam apenas o orçamento restante e, quando o orçamento se esgota, a liberação conservadora acontece de imediato — a espera total da interface principal nunca excede o limite de 3 segundos estabelecido na primeira rodada. O orçamento termina depois que um resultado de avaliação é produzido (resultado real / liberação conservadora / fallback de falha / conclusão do onboarding pelo usuário); quando já existe um resultado de avaliação, o fallback de timeout das rodadas seguintes deixa de valer, para não derrubar a interface principal já liberada nem o onboarding em andamento.
- Limitação conhecida: em hosts sem serviço de registro (visão web somente-home, test doubles apenas de renderização) o onboarding automático nunca é exibido (resultado direto da semântica conservadora); esse lado pertence a uma lacuna de montagem de serviço (semelhante à falta de registro da §5.1 para o workspace remoto do celular), e a direção da correção é conectar um serviço de registro de mesma origem que o desktop, em vez de criar um fallback na camada da regra de disparo; até a correção da lacuna, o usuário ainda pode abrir o onboarding manualmente pela página de settings.
- `save()`: após o update de settings existente, chama `appendRecord()`; falha ao acrescentar gera apenas log warn,
  sem bloquear o fluxo principal do onboarding e sem reportar erro ao usuário.
- Campos de settings como `onboardingOccupation` continuam sendo gravados (o pool de prompts recomendados ainda depende deles),
  com semântica agora igual a "a profissão escolhida mais recentemente pelo usuário atual".

## 6.5 Pré-preenchimento e saída direta ao reabrir o onboarding

- **Pré-preenchimento**: o onboarding aberto manualmente pela entrada de settings (ou atalho), bem como o onboarding disparado novamente, inicializam as opções das três páginas com a resposta mais recente desse userId no record (`getLatestEntry()`). Campos registrados como null por página pulada recebem o default de pré-preenchimento (profissão developer / padrão de preferências); quando a profissão do record não está na lista atual (a lista evolui), também cai no default. No modo de programação, a memória de trabalho proativa é sempre pré-preenchida como desligada, mesmo que tenha sido manualmente ligada e salva antes nas settings; no modo de escritório, segue a resposta mais recente e, sem respostas, o padrão é ligado. Se os dados de pré-preenchimento chegarem de forma assíncrona e o usuário já tiver interagido, a escolha dele não é sobrescrita.
- **Concluir o onboarding novamente**: as escolhas deste ciclo são gravadas como nova configuração em settings e no record, sobrescrevendo as preferências salvas anteriormente na página de settings ou no último onboarding. Se o usuário reabrir o onboarding no modo de programação e salvar diretamente, a memória de trabalho proativa que havia sido ligada manualmente passa a desligada; esse é o comportamento esperado.
- **Saída direta**: o botão X no canto superior direito da página de onboarding e a tecla ESC permitem sair — sem salvar e sem alterar settings — registrando a decision de elegibilidade `dismissed`, de modo que o onboarding não dispare automaticamente depois. Quando aberto ativamente pelas settings, ele ainda pode ser fechado a qualquer momento voltando à interface original; uma identidade que já possui respostas e fecha o onboarding aberto manualmente não gera nova decision.

## 7. Repreenchimento de settings (restaura preferências ao trocar de conta)

As settings não são divididas por usuário, então, depois que A responde, B disparar o onboarding sobrescreveria as settings com as respostas de B. Por isso, quando uma mudança de estado de login (ou a inicialização) avalia que "não é necessário o onboarding", é preciso chamar `syncSettingsFromRecord()` para repreencher nas settings `onboardingOccupation / proactiveSuggestionsEnabled / memoryEnabled` com a resposta **mais recente** do userId atual no record, com a troca do conteúdo da área de recomendações junto. Convenções:

- Momento do repreenchimento (revisão CR-03): executado **apenas após uma mudança de userId em runtime** (troca de conta/login); a primeira execução na montagem (inclusive o null→id causado pela restauração assíncrona do OAuth na inicialização) faz apenas a avaliação de disparo sem reescrita — caso contrário os toggles de recomendações/memória desligados manualmente pelo usuário seriam revividos pelo record a cada inicialização.
- Escrita manual de volta no record (revisão CR-03): o botão de desligar da área de recomendações e os toggles de sugestão/memória na página de settings, ao atualizar as settings, chamam também `updateRecordPreferences()` para reescrever a entrada do usuário atual (falha gera apenas warn, sem bloquear); o record é sempre igual a "as preferências mais recentes daquele usuário", e por isso o repreenchimento nunca sobrescreve nenhuma alteração manual.
- Campos registrados como null por página pulada recebem o default conservador no repreenchimento (profissão `other`, preferências desligadas), em coerência com o onboarding pulado que grava settings.
- Quando a profissão no record é uma string fora do enum (a lista de profissões evolui), ela é estreitada via `appSettingsOccupationEnum` antes do repreenchimento, e valores desconhecidos caem em `other`.
- Quando o usuário atual não tem registro, as settings não são alteradas; falha na sincronização gera apenas log warn.

## 7. Upload reservado (a implementar após a definição da interface do servidor)

O comportamento comum de telemetry de exposição e conclusão do onboarding está descrito em [Spec de telemetry do onboarding de usuário](monitoring/onboarding-telemetry.md).
O upload das escolhas ao final desse evento (incluindo o estado das marcações quando a terceira página é pulada) não equivale ao upload do registro local e não altera a regra de gravar null nos campos pulados nem o uploadState deste registro. O modo de telemetry usa work/code, enquanto o interfaceMode local continua usando office/coding; os campos de identidade reutilizam o user_id/device_mid da telemetry comum.

- payload = as entries do arquivo com `uploadState === "pending"` + deviceMid; `decisions` não são enviadas;
- após sucesso do upload, a entry correspondente passa a `uploaded`;
- momento de disparo pendente (reenvio na inicialização / envio após o login).