# Todo 56: Sincronização automática no nível de Environment do Remote Provider Provisioning

> Status: concluído
>
> Data: 2026-09-01
>
> Pré-requisito: mesclar primeiro a linha de base de Remote Provider Provisioning de `origin/provider-refactor-m2` e implementar o Todo 55 por completo; este Todo só conecta a sincronização automática depois que o Provider Template, o Personal Provider Config final e o contrato de Account Family reduzido estiverem estáveis, e não aceita reversões desses conteúdos pela linha de base remota antiga.

## 0. Objetivo

Remote Provider Provisioning é um mecanismo temporário de sincronização v0 para o produto de configuração remota de modelos, enquanto ele ainda não está totalmente no ar. Esta rodada não constrói a UI de gerenciamento de configuração remota nem faz do remoto a autoridade de edição; apenas copia de forma confiável a configuração atual de chamadas de modelo do Environment local para cada Remote Environment online.

```text
Local Environment（v0 管理权威）
├─ Personal Provider Config
├─ Personal Model Config Rules
├─ Provider / Model order
├─ Configured Default
├─ Account Family 窄设置
└─ Provisioning allowlist credentials
              |
              | Environment 级自动 Provisioning
              v
Remote Environment（可丢弃的执行镜像）
├─ 正式 Store 原子落盘
├─ Account Source / Registry refresh
└─ 后续新建 Model 使用新事实
```

O Remote Provisioning não sincroniza o Built-in Release, não injeta Registry Snapshot, não reescreve um Active Model já criado e não muda a semântica de Desktop `continuous`, Mobile `replayable`, fila de tarefas ou recuperação.

## 1. Linha de base de merge

### 1.1 Ordem de merge

1. atualizar as referências remotas e confirmar que o workspace não tem alterações de usuário não identificadas;
2. mesclar `origin/provider-refactor-m2`, sem reescrever o histórico do branch atual com rebase;
3. resolver conflitos conforme a semântica já decidida atualmente;
4. rodar primeiro a validação da linha de base de merge do typecheck de Provisioning, Provider, Settings e E2E;
5. só implementar este Todo depois que a linha de base estiver de pé, sem misturar a localização de falhas de merge com mudanças de design da sincronização.

### 1.2 Adjudicação de conflitos

O branch remoto contém uma implementação válida de Provisioning Source, Target, transação, RPC e integração do Host, mas ela se baseia em documentos e estado de E2E mais antigos. No merge é obrigatório:

- manter o `todo-55-provider-template-inheritance-cutover.md` atual;
- manter as E2E de Family Z.ai / BigModel e de Structured Connection Selection já restauradas;
- manter as decisões mais recentes como Model Option Map e o reasoning mínimo dos modelos auxiliares;
- receber o Source, Target, Envelope, transação do Target e a integração de capacidades remotas do Remote Provisioning;
- não aceitar mecanicamente a conclusão antiga de que "o Family Case perdeu o objeto de produto" nem a remoção dos Family Cases formais atuais;
- resolver conflitos do mesmo arquivo item a item conforme o Design atual, sem sobrescrever o arquivo inteiro com ours/theirs.

## 2. Semântica da sincronização v0

### 2.1 Cada sincronização é uma sobrescrita com o snapshot local completo

Conteúdo sincronizado:

- o Personal Provider Config completo: `providers`, `modelConfigRules`, `providerOrder`;
- o Configured Default;
- `providerFamilyDomain` e `providerFamilyConnectionSelections`;
- o conjunto completo de credenciais dentro do Provisioning allowlist.

Regras de sincronização:

- não verifica se o remoto já tem configuração;
- não compara se o conteúdo remoto é igual ao local;
- um valor local vazio também precisa ser sincronizado, para que o espelho correspondente no remoto possa ser limpo;
- Personal Config, Configured Default e as configurações estreitas de conta são sobrescritos pelo valor local;
- credenciais do allowlist usam semântica de replace-allowlist: as existentes localmente são gravadas, as credenciais remotas da mesma classe já removidas localmente são apagadas e credenciais remotas fora do allowlist ficam intactas;
- o Target continua usando a escrita atômica existente, o lock do Target, o rollback de transação, a idempotência por `syncId` e o Registry refresh;
- uma configuração local incompleta pode ser salva e sincronizada, mas o Registry do Target continua isolando Provider/Model não executável pelas regras formais de completude.

Por isso são removidos:

- `onlyIfMissing`;
- a pré-verificação `personalConfigExists` e o "pular se o remoto já tiver configuração";
- a comparação de igualdade do conteúdo remoto;
- o botão manual "sincronizar local para remoto", o diálogo de confirmação e o estado correspondente no Renderer;
- a semântica antiga de "o logout local não revoga credenciais no remoto".

### 2.2 Pontos de disparo

O disparo vem apenas de persistência bem-sucedida ou de eventos do ciclo de vida do Environment, sem redefinir na UI "quais campos contam como mudança de Provider".

```text
Personal Provider Config save 成功 ─┐
Configured Default save/clear 成功 ─┤
Account 窄设置 save 成功 ───────────┤
allowlist credential save/delete 成功 ┤
Remote Environment offline -> online ─┤
                                      v
                         Environment Sync Coordinator
```

Fronteiras específicas:

- o Provider Config escuta os eventos de mudança bem-sucedidos do Repository/Service e responde apenas ao Personal Config, não ao refresh de fundo do Built-in Release;
- o Configured Default escuta o save/clear do Repository de Model Selection Config formal;
- as configurações de Account escutam a atualização bem-sucedida do Setting Service formal, mas o Source ainda pega apenas os campos estreitos permitidos no Envelope;
- o Credential Service ganha notificações privadas de Host de save/delete bem-sucedidos, e o Source filtra pelo allowlist já existente; nenhuma nova API de Credential no Renderer;
- o attach de Remote Workspace só dispara quando o Remote Environment pertencente a ele passa de zero conexões online para pelo menos uma; abrir outro Workspace no mesmo Environment não dispara de novo;
- falha ao salvar, cancelamento de edição, rascunhos não persistidos ainda em digitação e mudanças de configuração sem relação não disparam nada.

## 3. O Environment é a única unidade de sincronização

Workspace não é objeto de sincronização. Vários Workspaces do mesmo Remote Environment compartilham um único canal de sincronização.

```text
Workspace A ─┐
Workspace B ─┼─> Remote Environment Key ─> 一条同步 Lane ─> Remote Target
Workspace C ─┘
```

A Environment Key precisa vir da identidade de conexão remota já existente:

- SSH: a connection key de host/conexão SSH já normalizada;
- WSL: a connection key existente de distro + user;
- Docker: a identidade do container;
- Server: a identidade do server ou a identidade de endpoint normalizada.

É proibido usar `workspacePath`, `workspaceIdentity` ou `remoteSessionId` como chave de deduplicação do Provisioning; eles expressam respectivamente caminho, isolamento de Workspace e uma única Session, e não equivalem a um Environment.

## 4. Coordinator de nível Application

Cada BrowserWindow tem seu próprio Local Host, e colocar o Coordinator apenas no Window Host não garante que várias janelas conectadas ao mesmo Environment sincronizem apenas uma vez. Nesta rodada adota-se execução no Main com despacho e execução no Host: o Main gerencia apenas metadata de despacho, sem tocar em Config ou Secret, o que está de acordo com a fronteira de "Main só despacha".

```text
Window Host A ─ register(env, target) ─┐
Window Host B ─ register(env, target) ─┤
Provider/Account/Credential trigger ──┤
                                      v
Desktop Main: Environment Coordinator
├─ env -> online Host/Target registrations
├─ env -> single-flight state
├─ env -> dirty generation
└─ 选择一个在线 Host 执行
                                      |
                                      v
Selected Window Host
├─ 重新读取最新 Local Source
└─ 调用该 Environment 的 Remote Target
```

O protocolo interno do Main carrega apenas:

- a Environment Key;
- a identidade de registro do Host;
- o motivo do trigger;
- o correlation id de execução/resultado.

Ele não pode carregar API Key, token OAuth, Config completa, Registry Snapshot ou credenciais de período de requisição. O Host executor relê os fatos locais mais recentes ao receber o despacho e gera o Envelope.

### 4.1 Registro e ciclo de vida

- quando o registro online global de um Environment vai de `0 -> 1`, solicita uma sincronização;
- um novo Workspace no mesmo Environment ou o registro de uma segunda janela apenas aumenta a contagem de referências e não dispara uma segunda sincronização de conexão;
- quando o registro vai de `1 -> 0`, marca offline; um novo `0 -> 1` sincroniza de novo;
- se o Host executor sai no meio da tarefa, o Main escolhe um novo executor entre os outros Hosts online daquele Environment; sem Target online, guarda uma pending intent e a executa após o próximo registro;
- não persiste o estado do Coordinator como um novo fato de configuração. Depois de reiniciar o aplicativo, o estado é reconstruído pelos registros online e a sincronização acontece de novo.

### 4.2 Single-flight + trailing refresh

No máximo uma sincronização por Environment ao mesmo tempo. Qualquer novo trigger durante a sincronização não gera envio concorrente nem pode ser descartado silenciosamente.

```text
generation = 1，开始读取 S1 并同步
        |
        +-- 同步中 Provider save，generation = 2
        +-- 同步中登录变化，generation = 3
        |
        v
S1 同步结束
        |
        +-- observed(1) != current(3)
        v
重新读取一次最新 S3 并同步
        |
        +-- 期间无新触发
        v
Lane idle
```

Requisitos de implementação:

- expressar o trailing refresh com uma flag monotônica de generation/dirty, sem acumular um item por evento;
- reler o Source antes de cada rodada, sem reaproveitar o Envelope antigo do momento do trigger;
- depois que a rodada atual tem sucesso ou falha, desde que a generation tenha mudado, executar de novo a rodada mais recente;
- se a rodada atual falhar e não houver novo trigger, parar a retentativa automática e esperar o próximo salvamento, mudança de conta ou reconexão;
- o chamador espera a conclusão de todo o drain, e não apenas da primeira rodada;
- não usar sleep fixo nem debounce adicional. O salvamento por digitação já tem debounce; o Coordinator só é responsável por mesclar concorrência e não perder o estado final.

## 5. Semântica de conexão e falha

A primeira conexão de Environment mantém o princípio já existente no branch remoto: depois que a capability do Target está pronta, tenta o Provisioning e só então publica o Remote Workspace executável; se o Provisioning falhar ou o remoto antigo não der suporte, isso não bloqueia a conexão, mas um warning claro precisa ser registrado. Sincronizações disparadas por salvamento em segundo plano não bloqueiam o feedback de sucesso do salvamento local.

```text
Remote transport ready
        |
        v
Environment register + 首次同步 attempt
        |
        +-- success/unsupported/failure 均形成明确结果
        v
Remote Workspace ready
```

- `unsupported` indica que o remoto antigo não tem a capability do Target e nenhum Secret é enviado;
- resultados de rede desconhecidos continuam usando retry idempotente por `syncId`;
- falha no rollback do Target ainda é reportada como `rollback_failed`;
- os logs são registrados por Environment Key, trigger, syncId, duração e resultado, sem imprimir Secret;
- detalhes de despacho de alta frequência usam `debug`; falhas no período de conexão e erros transacionais irrecuperáveis usam `warn/error`.

## 6. Fatias de implementação

1. mesclar a linha de base remota e resolver os conflitos de semântica conforme 1.2;
2. concluir o Todo 55 e confirmar que o Provisioning Envelope consegue carregar o Personal Provider Config final, e que as Account Settings não aceitam mais a variant `api-key` de Family;
3. atualizar o Provisioning Envelope/Target para semântica de sobrescrita completa e de credencial replace-allowlist;
4. remover `onlyIfMissing`, a pré-verificação de existência remota e o Renderer/UI de sincronização manual;
5. adicionar o Environment Coordinator e o protocolo de despacho interno do Host no Desktop Main;
6. projetar de forma unificada o registro de conexão de SSH, WSL, Docker e Server em uma Environment Key;
7. conectar os gatilhos de Personal Config, Configured Default, Account Setting, Credential e ciclo de vida online;
8. remover os estados duplicados de in-flight/sincronização em nível de facade e de Workspace;
9. atualizar `docs/remote/provider-provisioning.md`, a documentação de arquitetura remota, o Feature Graph e a matriz de testes;
10. enviar um Conventional Commit depois de concluir a verificação automatizada.

## 7. Prova automatizada

### 7.1 Testes unitários do Coordinator

- abrir vários Workspaces no mesmo Environment SSH dispara a sincronização inicial apenas uma vez;
- registrar o mesmo Environment em dois Window Hosts ainda dispara apenas uma vez;
- Environments diferentes sincronizam uma vez cada;
- várias mudanças consecutivas de save/login/default durante a sincronização executam apenas a rodada atual e a rodada final mais recente;
- a rodada final lê o Source mais recente e não envia o snapshot do momento do trigger;
- após a saída do Host executor, outro Host online assume;
- depois que o último Target fica offline nada é enviado, e voltar a ficar online dispara uma vez;
- a falha não gera retentativa infinita, e o próximo trigger formal consegue se recuperar.

### 7.2 Testes unitários de Source/Target

- escritas bem-sucedidas de Personal Config, Configured Default, configurações estreitas de conta e credenciais do allowlist disparam;
- save falho, Setting sem relação e refresh de Built-in não disparam;
- um Personal Config vazio consegue limpar a Personal Layer correspondente no remoto;
- logout/exclusão local consegue apagar a credencial correspondente no allowlist remoto;
- credenciais remotas fora do allowlist permanecem inalteradas;
- uma falha em qualquer etapa do Target faz rollback completo;
- após o sucesso, o Account Source/Registry é atualizado e o Active Model existente permanece congelado.

### 7.3 Integração e regressão

- a primeira conexão remota publica o Workspace ready depois que a tentativa de sincronização termina;
- Provisioning sem suporte ou com falha não bloqueia a conexão remota;
- Desktop continuous e Mobile replayable não mudam;
- SSH, WSL, Docker e Server têm pelo menos um teste de Environment Key/registro cada;
- a página de configurações de Provider não mostra mais botão de sincronização manual nem estado de sincronização remota;
- Renderer, retornos de RPC e logs não vazam Secret.

## 8. Portões de conclusão

- cada Remote Environment online forma no máximo uma lane single-flight por trigger, independentemente do número de Workspaces;
- mudanças que ocorrem durante a sincronização não se perdem e o remoto termina recebendo o snapshot local mais recente;
- configuração local vazia e exclusão de credenciais conseguem propagar;
- todos os triggers vêm de fronteiras de persistência bem-sucedida/ciclo de vida, sem depender de enumeração de campos da UI;
- o Main só despacha e não mantém nem transporta Secret;
- entradas antigas de sincronização manual, `onlyIfMissing`, sincronização duplicada em nível de Workspace e entradas de Provisioning no Renderer vão a zero;
- os testes unitários direcionados, `pnpm typecheck` e `pnpm lint` passam;
- enviar a implementação deste Todo antes de entrar no Todo 57, para facilitar a localização da linha de base no E2E.

## 9. Não objetivos

- a UI v1 de gerenciamento remoto de estado de login e configuração de modelos;
- sincronização bidirecional, merge de conflitos ou retorno de edições do remoto;
- sincronizar o Built-in Release;
- otimizar a implementação em que o Provisioning Source lê diretamente o arquivo físico do Credential Store;
- modificar novamente a semântica de produto de Provider Template, Provider Family ou Personal Config já estabilizada no Todo 55;
- refatorar a semântica de Remote Workspace, fluxo de tarefas, owner/lease ou recuperação replayable.

## 10. Registro de implementação

Nesta rodada foram concluídos:

- o Provisioning foi fechado como um Coordinator de nível Remote Environment no Desktop Main; o mesmo Environment mantém uma única lane entre Workspaces e entre janelas;
- implementação de single-flight, trailing refresh por generation, troca quando o Host sai, pending offline e sincronização ao voltar online;
- o Host só lê o Source local atual após o despacho do Main, e o protocolo do Main não transmite Config nem Secret;
- Personal Config, Configured Default, configurações estreitas de conta e credenciais do allowlist disparam todos os Environments online após a persistência bem-sucedida;
- o Target passou a sobrescrever com o snapshot completo, e Personal Config vazio, modelo padrão vazio e exclusão de credenciais conseguem propagar;
- remoção da entrada de sincronização manual do Renderer, do estado de sincronização em nível de Workspace, da pré-verificação de existência remota e do `onlyIfMissing`;
- atualização dos documentos de fatos atuais de implantação remota, Provisioning e Environment.

Evidências de verificação:

- 12 arquivos de teste direcionados de Provisioning, Remote Session, Service Trigger, protocolo e resíduos de UI, totalizando 102 testes, passaram;
- unit completo: 12782 passaram, 25 skips já existentes;
- `pnpm typecheck` na raiz passou;
- `pnpm lint` na raiz passou (mantendo apenas os warnings já existentes do repositório);
- `git diff --check` passou e a varredura das abstrações antigas de Provisioning de Renderer/Workspace e das entradas de preflight vai a zero.

O Todo 57 adicionou asserções formais de ciclo de vida SSH: após o primeiro Workspace conectar, lê os `records[]` do `provider-provisioning-state.json` remoto, abre um segundo Workspace no mesmo Environment SSH e prova que a contagem de registros não aumenta mais. Esse Case passou no typecheck de E2E; o MacBook Pro atual não tem credenciais reais de E2E SSH configuradas, então o resultado WDIO real é registrado estritamente como `blocked-environment`, e o single-flight, o trailing refresh e a mesclagem entre Workspaces do Environment Coordinator continuam cobertos pelos testes unitários/integrados direcionados deste Todo.

> Decisão posterior: neste Todo, a semântica de primeira conexão "Provisioning sem suporte ou com falha não bloqueia a conexão remota" foi substituída pelo Todo 59. O fato atual é que a primeira sincronização só publica o Remote Workspace com `applied` / `already-applied`; uma falha de sincronização após a conexão já estabelecida mantém o Workspace online, e o período de transição apenas registra logs estruturados.