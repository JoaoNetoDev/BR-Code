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
sincronização atual é explicitamente Local → Remote; um logout ou remoção local não revoga credenciais já gravadas no remoto.

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