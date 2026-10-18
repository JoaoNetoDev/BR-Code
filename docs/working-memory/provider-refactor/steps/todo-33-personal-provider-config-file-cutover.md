# Todo 33: Arquivo Dedicado de Personal Provider Config e Aposentadoria do Store Antigo

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: revisão do armazenamento de configuração antes do lançamento do Provider Refactor
>
> Tarefas relacionadas: [`Todo 06`](./todo-06-config-storage-envelope-repository-privatization.md),
> [`Bugfix 05`](./bugfix-05-personal-config-worker-refresh.md)

## 1. Problema

Atualmente o Personal Provider Config fica por padrão no `config.json` do diretório de configuração do Environment. Esse nome de arquivo também é usado pela configuração abrangente antiga do ZCode/CLI,
fazendo com que o arquivo Personal oficial, a entrada do Legacy Importer e outras configurações de produto entrem em conflito de nomenclatura física. Para reescrever o formato antigo no lugar, o Repository ainda introduziu o backup `pre-provider-v1` e a sobrescrita de recuperação de corrupção.

Além disso, o `model-providers.json`, cuja escrita já foi aposentada, ainda é usado pelo Desktop Legacy Reader como entrada de fallback; o Remote Workspace ainda pode transportar a Coding Plan API Key desse
Store antigo. Essas duas cadeias de compatibilidade não fazem mais parte do objetivo de lançamento.

## 2. Decisão Final

O Personal Provider Config e as Personal Model Config Rules são salvos uniformemente no diretório de configuração do Environment owner, em:

```text
provider_config.json
```

O conteúdo do arquivo continua usando o envelope de versão privado do Repository:

```text
schemaVersion
providerOrder
providers
modelConfigRules
```

`provider_config.json` é o único arquivo oficial de Personal Provider/Model Config. `model-selection.json`, o Active/LKG do ZCode Built-in, o Account Config e os demais `config.json` usados por MCP/Plugin/Hook permanecem independentes.

Como esta funcionalidade ainda não foi lançada:

- Não se reconhece nem se migra o formato Provider v1 intermediário que o branch de desenvolvimento atual chegou a gravar no `config.json`;
- Não se lê `model-providers.json`;
- Não se migra a Coding Plan API Key do Store de Provider antigo;
- Não se gera backup de migração;
- Não se remove nem se reescreve o `config.json` legado, que serve apenas como entrada somente leitura única da configuração antiga já publicada.

## 3. Migração e Responsabilidades de Processo

### 3.1 Desktop / Web Host Environment

```text
Local Host Provider Runtime.start()
        |
        v
Travar provider_config.json
        |
        +-- Já existe --> Ler o arquivo oficial
        `-- Não existe --> Ler o config.json antigo somente leitura
                         |
                         v
                    Converter em Personal Overlay esparso
                         |
                         v
                    Gravar provider_config.json atomicamente
        |
        v
Host Registry pronto
        |
        v
Permitir despachar Agent Runtime Env / iniciar Worker
```

Cada janela do Desktop tem um Local Host; várias janelas podem compartilhar o mesmo diretório de configuração do Environment. A primeira migração precisa revalidar dentro do lock do arquivo de destino se o arquivo existe, tornando a inicialização concorrente de vários Hosts idempotente. O Host precisa concluir a inicialização do Provider Runtime antes de despachar o caminho oficial ao Agent.

### 3.2 Desktop Agent Worker

O Agent Worker despachado pelo Desktop lê `provider_config.json` somente através de `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`. Ele não possui
Legacy Importer e não participa da migração; quando vive por muito tempo, continua usando a polling de content-revision do Bugfix 05 para rastrear escritas externas.

### 3.3 Standalone CLI

O Standalone Prompt CLI/TUI é a raiz de composição do seu próprio Environment. Quando `~/.zcode/v2/provider_config.json` está ausente, ele lê somente o `config.json` já existente do usuário da CLI e executa uma importação única. O caminho de Worker de protocolo continua lendo apenas o arquivo oficial.

## 4. Semântica do Repository

- O nome de arquivo de destino padrão é uniformemente `provider_config.json`; caminhos de teste/host injetados explicitamente continuam suportados;
- A primeira leitura conclui "checagem de existência -> importação legada -> escrita atômica" dentro do lock do arquivo de destino;
- O Legacy Reader só considera o arquivo de origem inexistente quando a leitura retorna `ENOENT`; falhas de IO, de parsing de JSON ou de validação de schema devem lançar erro para o
  Repository e não podem ser convertidas em lista vazia de Providers. Em caso de falha de leitura, mantém-se a degradação em memória e o callback de recovery existentes, sem criar `provider_config.json`; o comando de escrita
  deve falhar ao encontrar a mesma falha, para impedir que um erro de primeira migração seja consolidado permanentemente como configuração vazia.
  A próxima leitura pode tentar a importação de novo; não se adiciona compensação por timeout, um segundo estado de migração nem monitoramento do arquivo antigo.
- O erro de leitura legada contém apenas o caminho de origem, a etapa da falha, o código de erro do sistema ou o caminho do campo de validação, sem o JSON original, valores de credenciais ou
  erro de parsing original. Ele é registrado pelo `onPersonalConfigRecovery` existente do host; o conteúdo do erro não pode vazar o texto original pela cause.
  Esse limite também vale para Desktop / Web Host, e a semântica de entrega de Worker e mensagens em tempo real do celular não muda.
- O arquivo de origem legado permanece sempre inalterado, portanto são removidos `backupPersonalProviderConfigBeforeMigration`, `backupFilePath` e todo o
  comportamento `.pre-provider-v1-*.bak`;
- Migrações futuras de `schemaVersion` do arquivo oficial são submetidas diretamente por escrita atômica, sem fabricar backups adicionais;
- Quando o arquivo oficial está corrompido, ele não pode ser disfarçado de entrada legada. O Repository preserva o arquivo original, degrada com um Personal Overlay vazio em memória e reporta o erro, sem sobrescrever o arquivo do usuário para garantir prontidão;
- O `update()` do Repository neste processo continua publicando `updated` imediatamente; outros processos apenas fazem polling da revision de conteúdo de `provider_config.json`;
- Mudanças posteriores no `config.json` antigo ou no `model-providers.json` não podem disparar refresh do Registry.

## 5. Limpeza das Cadeias Antigas

### 5.1 `model-providers.json`

- Remover o fallback de arquivo do Desktop Legacy Reader, o parsing multi-versão do Store antigo e os logs relacionados;
- O Legacy Reader restante expressa apenas "ler Providers do `config.json` antigo do ZCode", e é renomeado conforme sua responsabilidade;
- Remover os testes e tipos auxiliares que cobrem apenas `model-providers.json`;
- Não monitorar, não migrar e não remover arquivos que possam ter restado em disco.

### 5.2 Account Coding Plan Key

- Remover `legacyAccountProviderApiKeyLoader`;
- Remover o parâmetro `loadLegacy` do Account Credential Store/Service;
- Remover a leitura de Key do Store de Provider antigo no Remote Workspace;
- A Key da conta atual é lida apenas do Credential Store de escopo de conta; quando ausente, é resolvida pelo OAuth/servidor atual e gravada no armazenamento de credenciais oficial.

## 6. Sobreposição de Caminhos

Deve ser modificado uniformemente:

- O caminho de Personal Config padrão do Desktop Local Host;
- O `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` despachado pelo Host para Agents locais/remotos;
- O `~/.zcode/v2/provider_config.json` da Standalone CLI;
- O seed de Provider Config do Desktop E2E;
- Os testes de caminho e migração de Provider Node, Services, CLI e Desktop.

Não é permitido renomear em massa os demais `config.json`. Os arquivos abaixo explicitamente não pertencem a este Todo:

- `~/.zcode/cli/config.json`;
- `.zcode/config.json` do workspace;
- Configurações de MCP, Plugin, Hook, Command e Skill;
- `model-selection.json`;
- Os arquivos Active/LKG do ZCode Built-in.

## 7. Plano de Testes

Escrever primeiro os testes que falham, depois alterar a implementação de produção:

1. Desktop/Services tem como destino padrão o `provider_config.json` no mesmo diretório;
2. A Standalone CLI tem como destino padrão `~/.zcode/v2/provider_config.json`;
3. Quando o destino não existe, importa uma vez do `config.json` antigo, sem alterar os bytes do arquivo antigo e sem gerar `.bak`;
4. Quando o destino existe, o Legacy Importer não é chamado;
5. Mesmo existindo, `model-providers.json` não é lido;
6. Dois Runtimes iniciando pela primeira vez em concorrência produzem apenas um arquivo oficial completo;
7. O Host já concluiu a inicialização do Personal antes do despacho do Agent Runtime Env;
8. Quando dois Repository apontam para o novo arquivo, a escrita atômica oficial ainda refresca o observador em um ciclo de polling;
9. Mudanças no arquivo antigo não disparam Personal change;
10. Quando o Account Credential Store/Service não tem a Key atual, ele não lê mais o Store de Provider antigo;
11. Salvar, reiniciar e o teste de conexão das Provider Settings do Desktop continuam usando o mesmo novo arquivo;
12. Os caminhos em macOS, Windows e Linux são compostos pelo `path` do Node, sem depender de separadores.

## 8. Critérios de Conclusão

- Não existe mais `config.json` de Personal Provider no caminho padrão de produção;
- O código de produção não lê mais `model-providers.json`;
- Não existe no código de produção um Coding Plan Provider Key Loader antigo nem parâmetro de credencial `loadLegacy`;
- Não são mais criados backups de migração do Personal Provider Config;
- Host, Worker e Standalone usam o mesmo `provider_config.json` para o mesmo Environment;
- A polling de content-revision do Personal, o refresh ativo do teste de conexão e a semântica de congelamento do Active Model permanecem inalterados;
- Os testes direcionados, o E2E relacionado, `pnpm typecheck`, `pnpm lint` e a verificação de formatação dos arquivos modificados passam.

## 9. Resultado da Implementação

- `PERSONAL_PROVIDER_CONFIG_FILE_NAME` passou a ser o fato compartilhado de nome de arquivo oficial entre Host, Services e Standalone CLI; o seed e os fixtures do Desktop
  E2E migraram junto para `provider_config.json`;
- O legacy importer do Repository só é chamado quando o destino está ausente, e completa a importação e a criação atômica dentro do lock do arquivo de destino; um arquivo oficial já existente
  não é mais tratado como entrada sem versão, e `.bak` não é mais gerado nem recuperado; um arquivo oficial inválido é mantido como está e degrada com um Overlay vazio em memória;
- O Local Host espera a inicialização do Provider Runtime antes de despachar o Agent Runtime Env, o Worker recebe apenas o caminho do arquivo oficial e continua usando a
  polling de content-revision;
- O Reader antigo foi renomeado conforme a responsabilidade restante para `legacyZCodeConfigProviderReader`, lendo apenas o `config.json` antigo já publicado; as referências a `model-providers.json` no código-fonte de produção chegaram a zero;
- `legacyAccountProviderApiKeyLoader`, o parâmetro `loadLegacy` do Credential Store/Service e o transporte da Key antiga no Remote Workspace foram totalmente removidos;
- Os testes direcionados de migração, caminho, concorrência, arquivo corrompido, gate estrutural, credenciais e CLI/Bootstrap passaram; o `pnpm typecheck`, o `pnpm lint` e o `pnpm test:unit` completo da raiz passaram. O resultado completo foi de 1487 arquivos aprovados e 1 pulado, 12675 testes aprovados e 25 pulados.