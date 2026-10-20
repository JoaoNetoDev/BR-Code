# Limite de Autoridade de Estado do Workspace Remoto SSH

> Documento de fatos atuais. O antigo esquema de envio de snapshots do Desktop Provider Registry foi descontinuado; planos e specs históricos e post-mortens só permanecem em
> working-memory, e os rastros do incidente.

## Conclusão principal

SSH/Docker/WSL anexado ao Desktop descreve apenas uma relação de conexão e operação; não significa que o Desktop Environment se estenda ao ambiente remoto.
O Remote Environment ao qual o agente de execução pertence possui o Provider Config, os fatos de conta, o Credential Store, o Registry e a
ModelFactory.

```text
Desktop Environment                     Remote Environment
===================                     ==================
Desktop app-global settings             Remote ZCode Built-in Config
Desktop OAuth / UI state                Remote Personal Provider Config
Local Provider Runtime                  Remote Account Provider Config
Local Registry                          Remote Credential Store
                                        Remote Registry
        |                                     |
        | remote settings/selection/task RPC  |
        +------------------------------------>|
                                              v
                                      Remote ModelFactory
                                              |
                                              v
                                      Remote model request
```

O Desktop não injeta no Remote Worker os seguintes conteúdos:

- O Registry completo de Providers ou seu snapshot serializado;
- Modelos de Runtime ou snapshots de configuração estática de Provider/Model;
- Account Provider Config do Desktop;
- API Key, JWT, Team Runtime Key ou Headers dinâmicos de requisição do Desktop.

Os antigos `workspace/updateProviderRegistry`, `ZCodeProviderRegistrySnapshot` e
`remoteWorkspaceProviderSync` não fazem mais parte do protocolo de produção nem do caminho de execução.

## Atribuição de estado

| Estado | Local autoritativo | Forma de leitura pelo remote anexado ao Desktop |
| -------------------------------------- | ----------------------- | ----------------------------------------- |
| Arquivos do Workspace, Git, Terminal | Remote Environment | Service remoto |
| Task, Session, execução do Agent | Remote Environment | Service remoto |
| Provider Settings View (runtime remoto) | Remote Environment | Facade remoto `provider-settings` |
| Página de configuração de modelos do Desktop (app-global) | Desktop Environment | `IProviderSettingsService` local |
| Model Selection View (runtime remoto) | Remote Environment | Facade remoto `model-selection` |
| Provider Config / Registry | Remote Environment | Objetos ou snapshots de Registry não atravessam a fronteira entre Environments |
| Provider Credential / Request Auth | Remote Environment | Não injetados a partir do Desktop Credential Store |
| Tema, janela e estado de UI local do Desktop | Desktop Environment | Service local |
| Desktop continuous / Mobile replayable | Seu respectivo owner de delivery já existente | Não afetado pela fronteira de Provider |

A ServiceCollection de workspace remoto vista pelo Renderer pode misturar Services locais de UI com Services de negócio remotos, mas essa
mistura é apenas uma forma de montagem de Facades e não altera a propriedade dos fatos da tabela acima. O runtime, a Session e a execução de modelos
do workspace remoto ainda devem usar os Provider Settings e o Model Selection do Environment de destino; a edição da configuração de modelos
app-global da página de configurações do Desktop é uma exceção explícita: ela lê e escreve somente o Desktop Local Environment e não roteia
implicitamente a ação de edição para o remoto.

## Sincronização interna do Environment

O Host e o Core Worker do mesmo Environment possuem suas próprias instâncias de Registry e compartilham os fatos de configuração daquele Environment:

```text
Environment Provider Sources
├─ ZCode Built-in Config
├─ Personal Provider Config
└─ Account Provider Config
          |
          +-------------------+
          |                   |
          v                   v
     Host Registry       Worker Registry
          |                   |
     Settings/View       ModelFactory/Execution
```

O Host pode enviar ao seu próprio Core Worker, via `provider/updateAccountConfig`, o Account Overlay sem Segredos deste Environment. Esse protocolo transporta
apenas `revision + basedOnZCodeBuiltinRevision + ProviderConfigMap`, e não API Key, JWT ou Headers dinâmicos. É um mecanismo de consistência entre
processos, e não sincronização de Provider do Desktop para o remoto.

Tanto o Registry do Host quanto o do Worker são reconstruídos por conta própria após mudanças nas Sources; a Registry View não é compartilhada entre
processos. Modelos Ativos já criados mantêm os fatos congelados no momento da criação, e a nova View afeta apenas os Modelos criados depois.

## Inicialização e recuperação

```text
Remote Host 启动
      |
      v
读取 Remote Built-in / Personal / Account Sources
      |
      v
Remote Host Registry ready
      |
      +--> 暴露 Provider Settings / Model Selection
      |
      v
Remote Worker 启动并读取同一 Environment 的 Sources
      |
      v
Remote Worker Registry ready -> 创建 Session / Model
```

Quando o Provider Runtime remoto ainda não está pronto, o chamador aguarda a barrier de ready do próprio Environment de destino. É proibido usar
snapshots do Registry do Desktop como bootstrap, fallback ou material de retentativa. Reconexões remotas e trocas de Worker apenas reconstroem o Runtime
remoto e não disparam replay do Registry local.

Quando a conexão cai, o cliente RPC ainda precisa rejeitar todas as requisições pendentes e limpar a generation antiga; esse é um invariante de ciclo de
vida de transporte, sem relação com a funcionalidade de sincronização de Provider já descontinuada.

## Provisioning de Configuração e Credenciais

Copiar configuração ou credenciais para outro Environment é uma capacidade de produto independente de Provisioning e não pertence ao runtime attachment
de workspace remoto; a implementação e o escopo atuais estão em `docs/remote/provider-provisioning.md`:

```text
Source Environment Config / Credential
                 |
                 | explicit provisioning
                 v
Target Environment Config / Credential Store
                 |
                 v
Target Sources publish change
                 |
                 v
Target Registry rebuilds itself
```

O Provisioning precisa escrever primeiro no Store oficial do Environment de destino, e só então o Registry de destino se reconstrói. Ele não pode construir
diretamente Registry, Model ou Runtime Headers, nem se tornar uma dependência online de cada requisição de modelo. Edição de configurações remotas e login
remoto também devem chamar o Service oficial do Environment de destino, em vez de tratar o Desktop Credential Store como fonte de autenticação remota. A
sincronização atual é explicitamente Local → Remote; o Provisioning atual é disparado automaticamente depois que uma credencial do allowlist local é salva ou removida com sucesso, e a próxima sincronização bem-sucedida revoga, pela semântica de replace, a credencial de mesmo nome no allowlist remoto, enquanto as credenciais fora do allowlist permanecem inalteradas. Durante o período offline ou de falha de sincronização, o feedback de remoção local não pode ser usado como prova de que a credencial já foi revogada no remoto; ver a especificação de Provisioning atual acima.

## Invariantes

- `workspaceIdentity` representa isolamento de identidade; `workspacePath` é usado apenas para execução de arquivos e comandos.
- O attachment remoto do Desktop não cria uma segunda Agent Runtime nem uma segunda fila de accepted-input.
- O `desktop-continuous` do Desktop não concatena mensagens de recuperação do replayable do celular; o
  `web-remote-replayable` do celular não contorna a recuperação por gap/snapshot.
- Fatos estáticos de Provider/Model vêm somente do Config e do Registry do Environment de destino.
- Credenciais dinâmicas de requisição não entram no Account Provider Config, na Registry View nem na persistência de Session.
- O writer de Registry completo já descontinuado não oferece fallback de compatibilidade.

## Designs atuais relacionados

- `docs/working-memory/provider-refactor/design/environment/environment.md`
- `docs/working-memory/provider-refactor/design/registry/runtime.md`
- `docs/working-memory/provider-refactor/design/registry/configuration.md`
- `docs/remote/zcode-agent-remote-deployment.md`
- `docs/web-remote-control/web-remote-control-architecture.md`

## Atribuição das configurações de aplicativo na página de configurações (correção A2 de 2026-09-16)

Ativar um workspace remoto muda apenas os serviços do workspace, e não o dono das configurações do Desktop. A página
de configurações precisa carregar e salvar separadamente por consumidor:

| Configuração | Dono de leitura e escrita | Motivo |
| --- | --- | --- |
| Aceleração de hardware do Chromium, bandeja do Windows, política de certificados do navegador embutido | base Local Host | O Desktop Main, na inicialização, lê apenas a configuração de bootstrap da própria máquina |
| Diretório de armazenamento de dados | base Local Host | O picker nativo devolve um caminho local; a cópia e o ponteiro de bootstrap precisam ficar na mesma máquina |
| Escolha de shell do terminal integrado | base Local Host | Os candidatos são enumerados pelo systemService local; um caminho de shell local não pode ser gravado no Source |
| Proxy HTTP, No Proxy e caminho de CA customizado | base Local Host | Configuração de inicialização da camada de renderização do desktop, do navegador embutido e dos subprocessos locais; não configura implicitamente outro Environment |
| Herança de Profile do terminal e fonte do terminal | Environment do workspace atual | Lidos quando o terminalService de destino cria o PTY |
| Chave e número de dias de arquivamento automático de tarefas | Environment do workspace atual | Executados pelo taskService de destino, que é o dono das tarefas |
| Skills/MCP/Plugins/Hooks/Subagents | scope resolver de destino já existente | Mantém a atribuição atual de User, Source e workspace |

```text
Página de configurações do Desktop (pode ser aberta em uma tab remota)
  ├─ leitura/gravação das configurações de aplicativo ──> base Local Host ──> setting.json local ──> cold start do Main
  └─ leitura/gravação das configurações de execução ──> workspace Source ──> setting.json do Source ──> serviços de destino
native picker ── diretório local ──> Local Host.updateDataBaseDir ──> ponteiro salvo após a cópia local bem-sucedida
```

- O primeiro ponto de desconexão corrigido é a SettingsPage; o ServiceCollection remoto não é modificado e o Provider da página de configurações não é trocado por completo.
- As cargas local e do Source são independentes; após a remoção ou a troca de destino, os resultados de leitura antigos são ignorados, evitando que um Source antigo sobrescreva a nova página.
- Falhas de gravação/cópia continuam propagando para o feedback existente, sem atualizar o estado de sucesso, sem recorrer à outra ponta e sem acrescentar retentativas.
- Campos gravados indevidamente no Source antes não são migrados nem removidos automaticamente: não se pode inferir pelo nome do campo se ele é uma configuração intencional do usuário remoto.
- O fluxo local do Desktop reutiliza o mesmo base service. Web/celular mantêm os base services e a visibilidade de plataforma já existentes; não se criam Host, conexão ou Agent, e continuous/replayable, queue, snapshot ou estado de login não são modificados.
- Verificação: os callbacks reais da SettingsPage com dublês local/remote separados; um caso único de SSH valida o salvamento local, a ausência de poluição do Source, o contraste de arquivamento automático no Source, a migração de diretório nativo e o cold restart do Electron. Shell/tray do Windows são complementados por testes de contrato, que não equivalem a uma validação em máquina Windows real.