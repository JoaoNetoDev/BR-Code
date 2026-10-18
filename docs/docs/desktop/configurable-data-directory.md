# Diretório de dados configurável

## Visão geral

Por padrão os dados da aplicação são armazenados em `~/.zcode/v2/` (`~` corresponde a `os.homedir()`). O usuário pode alterar o diretório raiz correspondente a `~` em "Configurações → Geral → Caminho de armazenamento de dados"; o sufixo `.zcode/v2` não pode ser alterado.

## Estrutura de diretórios

```
<dataBaseDir>/.zcode/v2/          ← diretório de dados configurável
  ├── logs/
  ├── perf/
  ├── sessions/
  ├── tasks-index.sqlite
  ├── telemetry-state.json
  └── ...

<dataBaseDir>/.zcode/workspace/default/  ← diretório de trabalho real compartilhado por conversas sem projeto

~/.zcode/v2/setting.json          ← ponteiro de bootstrap (sempre no homedir padrão)
```

## Mecanismo de bootstrap

`setting.json` sempre existe, e apenas no caminho padrão `homedir()/.zcode/v2/setting.json`; ele não migra junto com um diretório personalizado. É o ponto de entrada que conduz toda a troca de caminhos:

1. O processo principal inicia → lê `dataBaseDir` de `homedir()/.zcode/v2/setting.json`
2. Se houver valor → chama `setDataBaseDir(dir)` para trocar todos os caminhos de dados seguintes
3. Ao iniciar o host process, é repassado aos processos filhos pela variável de ambiente `ZCODE_DATA_BASE_DIR`

Prioridade de resolução de caminho (`getDataBaseDir()`):
1. Valor definido por `setDataBaseDir()` (bootstrap do processo principal)
2. `process.env.ZCODE_DATA_BASE_DIR` (o host process recebe por variável de ambiente)
3. `os.homedir()` (valor padrão de fallback)

## Comportamento de cópia

Quando o usuário altera o diretório de dados, os dados do diretório antigo são copiados para o novo:

| Regra | Descrição |
|------|------|
| **setting.json e seus arquivos transitórios não são copiados** | `setting.json` é o ponteiro de bootstrap; `setting.json.lock` e `setting.json.*.tmp` são estados intermediários de escrita atômica, e todos existem apenas no homedir padrão; copiá-los causaria corrida de migração ou conflito entre diretório novo e antigo |
| **Arquivos existentes não são sobrescritos** | `force: false` — se o diretório de destino já tiver um arquivo com o mesmo nome, a versão do destino é mantida. Isso evita que, ao voltar para o diretório antigo, dados novos sejam sobrescritos por uma cópia antiga |
| **Arquivos novos são copiados normalmente** | Arquivos que existem na origem e não existem no destino são copiados |
| **conversation workspace ainda não foi migrado** | Atualmente `copyDataDirectory()` copia apenas `.zcode/v2`; a cópia sem sobrescrita de `.zcode/workspace` pertence à semântica de destino e será incorporada à migração do diretório de dados após a implementação de CDD02/seguintes |

### Exemplo de cenário

**Migração positiva** (`/Users/a` → `/Users/a/test`):
- Todos os arquivos sob `/Users/a/.zcode/v2/` (exceto setting.json) são copiados para `/Users/a/test/.zcode/v2/`
- Se o diretório de destino não existir, ele é criado automaticamente

**Reversão** (`/Users/a/test` → `/Users/a`):
- Os arquivos sob `/Users/a/test/.zcode/v2/` são copiados para `/Users/a/.zcode/v2/`
- Mas arquivos novos criados nesse período sob `/Users/a/.zcode/v2/` não são sobrescritos
- `setting.json` nunca é afetado

## Proteção do diretório de instalação no Windows

No Windows é proibido definir o diretório raiz de dados como o diretório de instalação do ZCode ou um subdiretório dele. A razão é que o diretório de instalação é gerenciado pelo instalador e pelo fluxo de atualização automática; se `<dataBaseDir>/.zcode/v2/` for colocado ali, atualizações posteriores podem sobrescrever ou limpar os dados do usuário.

Regras de bloqueio:

| Origem | Exemplo |
|------|------|
| Diretório de instalação do app desktop atual | O diretório pai de `process.resourcesPath`, por exemplo `C:\Users\{UserName}\AppData\Local\Programs\ZCode` |
| Diretório de instalação em Program Files | `%ProgramFiles%\ZCode`, `%ProgramFiles(x86)%\ZCode`, `%ProgramW6432%\ZCode` |
| Diretório de instalação em LocalAppData do usuário | `%LOCALAPPDATA%\Programs\ZCode` |

`packages/desktop/src/main/desktopRuntimeEnv.ts` passa o diretório de instalação atual ao host process por `ZCODE_WINDOWS_APP_INSTALL_DIR` no estado empacotado para Windows. `packages/services/src/paths.ts` faz, na camada de serviço, um julgamento de "igual ou está sob ele" insensível a maiúsculas/minúsculas segundo as regras de caminho do Windows, e `packages/services/src/setting/settingService.ts` executa essa validação antes de copiar os dados. A UI apenas exibe a mensagem de erro, não funcionando como única barreira de segurança.

### Proteção de bloqueio no instalador

O pacote de instalação do Windows não impede o usuário de escolher um diretório de instalação arbitrário. Para cobrir usuários de versões antigas que já colocaram dados no diretório de instalação, o assisted installer do NSIS verifica, depois que o usuário escolhe o diretório de instalação e antes de escrever os arquivos de fato, se o diretório final de instalação e seus subdiretórios contêm `.zcode`:

1. Calcular o diretório final de instalação conforme as regras de preenchimento de diretório do assisted installer do electron-builder
2. Se o usuário escolheu o diretório pai, o electron-builder instala em `$INSTDIR\ZCode`; portanto verificar `$INSTDIR\ZCode` e seus subdiretórios
3. Em caso de acerto, exibir uma página de bloqueio informando que o diretório de instalação ou um subdiretório contém dados `.zcode`, e que continuar a instalação ou atualização fará o instalador limpar sessões e configurações históricas
4. A página de bloqueio desabilita "Próximo" e aumenta a largura do botão "Anterior", com o texto alterado para "Escolher outro diretório"
5. Depois que o usuário clicar em "Escolher outro diretório", ele retorna à página de seleção de diretório e precisa escolher outro diretório de instalação para continuar
6. O usuário ainda pode cancelar e sair do instalador; não há uma entrada "ignorar e continuar"
7. Na instalação silenciosa, ao acertar `.zcode`, o instalador sai com falha diretamente, evitando que a instalação automatizada contorne a proteção de dados

Essa proteção de bloqueio se aplica apenas ao fluxo do pacote de instalação e não substitui a validação de migração de dados da página de configurações.

## Fluxo de interação na UI

1. A caixa de somente leitura exibe por padrão o caminho em vigor (o caminho configurado ou o homedir)
2. Ao clicar em "Selecionar pasta", escolher o novo diretório raiz pela caixa de diálogo de diretórios do sistema
3. Depois de conferir, clicar em "Salvar"
4. O botão exibe uma animação de carregamento, o botão de seleção fica desabilitado e a mensagem "正在复制数据，请勿关闭应用…" (Copiando dados, não feche o aplicativo…) é exibida
5. Cópia concluída → "数据已保存，重启应用后生效。" (Dados salvos; surte efeito após reiniciar o aplicativo.)
6. Falha na cópia → "数据复制失败，路径未更改。" (Falha ao copiar os dados, o caminho não foi alterado.) em vermelho; é possível selecionar novamente e tentar de novo
7. No Windows, se for selecionado o diretório de instalação do ZCode ou um subdiretório → "不能选择 ZCode 安装目录作为数据存储路径" (Não é possível escolher o diretório de instalação do ZCode como caminho de armazenamento de dados), e o caminho não é gravado na configuração
8. O novo caminho entra em vigor quando o usuário reinicia o aplicativo

## Limites de migração confirmados

Em 2026-08-10 o usuário confirmou a seguinte semântica de destino:

1. `.zcode/v2` do App e `.zcode/workspace` de conversas sem projeto migram juntos.
2. A migração só pode ser iniciada quando a conversa atual estiver ociosa.
3. Depois de salvar com sucesso, entra em estado de reinício pendente; o estado de produto de destino deve impedir novas gravações no diretório de dados antigo do App.
4. A migração é recusada quando o diretório de destino já contém dados do ZCode, sem mesclar arquivo a arquivo nem fazer merge do SQLite.
5. Após um cold restart completo, o histórico de tarefas anterior à migração continua visível, e é possível continuar a conversa na mesma tarefa.
6. `dataBaseDir` altera apenas o diretório de dados do App; os recursos de usuário do CLI continuam usando `<HOME>/.zcode/cli`, e `.zcode/*` dentro do projeto também mantém o caminho original.

O primeiro case automatizado, `CDD01`, não modifica o comportamento de produto acima; ele apenas verifica um caminho representativo que pode ser executado com segurança hoje: Desktop local `desktop-continuous`, tarefa já ociosa, diretório de destino vazio e, após salvar, nenhuma operação de negócio executada, com reinício completo imediato de Electron, Host e Agent.

```text
old App root + idle task
          |
          | choose empty target + save
          v
restart-required UI
          |
          | no more writes in the old process
          | immediate full cold restart
          v
new App root
          +--> old task history is visible
          +--> same task accepts a follow-up
          +--> App task-index writes stay under the new root
          +--> CLI stays under <HOME>/.zcode/cli
```

O requisito de ociosidade e o reinício imediato do `CDD01` são restrições de pré-condição/tempo do teste e não significam que o produto atual já bloqueie mecanicamente a migração durante operação busy nem as escritas após o salvamento; a recusa de destino não vazio também não é provada por esse case. Atualmente `copyDataDirectory()` copia apenas `.zcode/v2` e ainda não implementa a migração de `.zcode/workspace` exigida por esta spec, portanto a asserção de workspace é registrada separadamente como bug candidate, e a aprovação do `CDD01` não pode ser interpretada como atendimento completo do item 1.

## Código relacionado

| Arquivo | Responsabilidade |
|------|------|
| `packages/services/src/paths.ts` | `setDataBaseDir` / `getDataBaseDir` / `getAppConfigDir` / `copyDataDirectory` / validação do diretório de instalação no Windows |
| `packages/services/src/setting/settingService.ts` | `updateDataBaseDir()` — validação + cópia + persistência |
| `packages/services/src/setting/setting.ts` | Definição da interface `ISettingService` |
| `packages/shared/src/protocol.ts` | Tipo `AppSettings.dataBaseDir` |
| `packages/shared/src/validation.ts` | schema zod |
| `packages/desktop/build/installer.nsh` | Instalador do Windows bloqueia a instalação quando já existe `.zcode` dentro do diretório de instalação, antes de escrever os arquivos |
| `packages/desktop/src/main/index.ts` | Leitura no bootstrap do processo principal |
| `packages/desktop/src/main/desktopRuntimeEnv.ts` | `buildHostProcessEnv` repassando a variável de ambiente |
| `packages/ui/src/settingsPageHelpers.tsx` | Campo de entrada na UI + gestão do estado de salvamento |
| `packages/ui/src/SettingsPage.tsx` | Estado da página + chamada de serviço |