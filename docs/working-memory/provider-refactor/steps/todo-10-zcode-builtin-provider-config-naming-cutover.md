# 10 Migração de nomenclatura da configuração de provedor nativo do ZCode

> Estado: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../provider-implementation-architecture-conformance-review.md`](../provider-implementation-architecture-conformance-review.md)
>
> Roteiro geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)

## 1. Objetivo da tarefa

Migrar de uma só vez, para `zcodeBuiltin` / `zcode-builtin`, todos os nomes de domínio, implementação e físicos
que no Provider Refactor ainda usam `official` para expressar a configuração nativa do ZCode. Após a migração,
a configuração de Provider/Model embutida no ZCode tem apenas um nome preciso:
**Configuração de Provider/Model nativa do ZCode**.

O Provider Refactor do branch atual ainda não foi publicado; não existe protocolo, variável de ambiente ou
arquivo físico de configuração de provedor já publicado que precise continuar sendo lido. Portanto, esta Tarefa
é uma renomeação atômica, não uma migração de compatibilidade: não se mantém alias, export deprecated, campo
duplo, leitura e escrita duplas, fallback de variável de ambiente antiga, fallback de caminho antigo nem importer.

```text
Cadeia de nomenclatura atual

config/provider/official.json
        |
        v
OfficialProviderConfigSource
        |
        v
officialProviders / officialModels
        |
        v
ProviderConfigService / Resolver / Facade
        |
        +--> Init do Desktop Host: officialProviderConfigFilePath
        `--> Env da CLI / SEA: ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE

Cadeia de nomenclatura alvo

config/provider/zcode-builtin.json
        |
        v
ZCodeBuiltinProviderConfigSource
        |
        v
zcodeBuiltinProviders / zcodeBuiltinModelRules
        |
        v
ProviderConfigService / Resolver / Facade
        |
        +--> Init do Desktop Host: zcodeBuiltinProviderConfigFilePath
        `--> Env da CLI / SEA: ZCODE_BUILTIN_PROVIDER_CONFIG_FILE
```

Esta Tarefa altera apenas nomes; não altera a ordem do Overlay, os membros de modelo, o Access, a integridade
do Registry, o comportamento da página de configurações nem o comportamento de chamada de modelo.

## 2. Decisões confirmadas

### 2.1 Termos de domínio

```text
Configuração de Provedor nativa do ZCode
        |
        v
sobrepõe a Configuração de Provedor nativa da Conta
        |
        v
Configuração de Provedor nativa efetiva
        |
        v
sobrepõe a Configuração de Provedor pessoal
        |
        v
Configuração de Provedor efetiva

Regras de Configuração de Modelo nativas do ZCode
        +
Regras de Configuração de Modelo pessoais
        |
        v
Regras de Configuração de Modelo efetivas
```

`official` deixa de ser sinônimo de domínio dessa cadeia de configuração. Documentação, tipos públicos, APIs
internas, variáveis locais, descrições de teste e mensagens de erro usam os termos Built-in acima.

### 2.2 Nomes de código e físicos

| Nome atual                                   | Nome alvo                                        |
| ------------------------------------------ | ----------------------------------------------- |
| `officialProviders`                        | `zcodeBuiltinProviders`                         |
| `officialModels`                           | `zcodeBuiltinModelRules`                        |
| `officialSource`                           | `zcodeBuiltinSource`                            |
| `OfficialProviderConfigSource`             | `ZCodeBuiltinProviderConfigSource`              |
| `createOfficialProviderConfigSource`       | `createZCodeBuiltinProviderConfigSource`        |
| `materializeOfficialProviderConfig`        | `materializeZCodeBuiltinProviderConfig`         |
| `resolveOfficialProviderConfigFilePath`    | `resolveZCodeBuiltinProviderConfigFilePath`     |
| `officialProviderConfigFilePath`           | `zcodeBuiltinProviderConfigFilePath`            |
| `isOfficial`                               | `isZCodeBuiltin`                                |
| `official-provider-config-source.ts`       | `zcode-builtin-provider-config-source.ts`       |
| `official-provider-config-materializer.ts` | `zcode-builtin-provider-config-materializer.ts` |
| `config/provider/official.json`            | `config/provider/zcode-builtin.json`            |
| `ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE`      | `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE`            |
| SEA `zcode-provider/official.json`         | SEA `zcode-provider/zcode-builtin.json`         |
| Arquivo gerado `official-<hash>.json`     | Arquivo gerado `zcode-builtin-<hash>.json`      |

Se durante a implementação forem encontrados outros símbolos `official*` na mesma cadeia de fatos, eles são
renomeados diretamente pela mesma regra. `zcodeBuiltin` expressa explicitamente a camada Built-in distribuída
pelo produto ZCode; não pode ser simplificado para um `builtin` sem origem, que se confundiria com
Built-in da Conta.

### 2.3 Compatibilidade zero

Todas as seguintes abordagens são proibidas:

- exportar o nome antigo de classe ou de campo como alias;
- aceitar simultaneamente `officialProviderConfigFilePath` e `zcodeBuiltinProviderConfigFilePath`;
- ler simultaneamente as variáveis de ambiente antiga e nova;
- recorrer a `official.json` quando o novo caminho não existe;
- empacotar no SEA as chaves de asset antiga e nova;
- adicionar migration/importer para a nomenclatura antiga;
- continuar usando o helper antigo nos testes e converter na fronteira de produção.

A presença de um nome antigo indica que a migração não foi concluída; não é um cenário de compatibilidade a
ser protegido.

### 2.4 Exclusões de escopo

`official` em Official MCP, Official Plugin/Marketplace, Official CUA, no site oficial ou em textos de produto
tem significado próprio e correto; não pertence à cadeia de nomenclatura da configuração de provedor e não
pode ser substituído mecanicamente.

## 3. Fatos atuais e superfície de impacto

A varredura direcionada de 2026-08-24 atingiu 40 arquivos de código de produção, além dos arquivos de
configuração publicados e da documentação de design/plano:

| Área                            | Arquivos atingidos | Responsabilidade principal                                  |
| ------------------------------- | ---------: | --------------------------------------------- |
| `packages/provider`             |         11 | Snapshot, Resolver, Service, Facade e testes    |
| `packages/provider-node`        |          5 | Source de arquivo, watcher, materializer e runtime |
| `packages/services`             |          7 | Composição de Services, injeção Desktop/Host   |
| `packages/shared`               |          2 | Campo de protocolo estrito do init do Host      |
| `packages/desktop`              |          9 | Mensagens Main/Host, caminhos de dev e empacotamento |
| `apps/zcode-cli`                |          6 | Variável de ambiente, asset SEA, descompactação de runtime e scripts de build |
| `config/provider/official.json` |          1 | Arquivo físico publicado atual                   |

Comando da varredura direcionada:

```bash
rg -n \
  'officialProviders|officialModels|officialSource|OfficialProviderConfig|officialProviderConfigFilePath|ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE|config/provider/official\.json|zcode-provider/official\.json' \
  packages/provider packages/provider-node packages/services packages/shared packages/desktop apps/zcode-cli config
```

Neste ambiente não há ferramenta de consulta de codegraph disponível; a superfície de impacto é validada de
forma cruzada pelo `capability.provider-registry` do Feature Graph, pela varredura exata acima, por `dep:refs`,
por TypeScript e por testes de build; não se pode depender apenas de substituição de texto.

## 4. Impact Brief

### 4.1 Funcionalidade e camada de mudança

| Campo             | Conclusão                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Developer intent | Remover o termo `official` incorreto da configuração de provedor e estabelecer uma nomenclatura Built-in única |
| Capability       | Provider Registry / Config Source / montagem de inicialização Desktop e CLI  |
| Change layer     | `persistence contract`, `commit-effect`, `validation`, build/package asset                  |
| Operating mode   | Uma migração atômica                                                                          |
| Primary seeds    | `ProviderConfigSnapshot`, `OfficialProviderConfigSource`, schema de init do Host, env de runtime da CLI |
| Out of scope     | Comportamento de Provider, Access, seleção de modelo, interação de configurações, Queue/Recovery, outros conceitos de produto Official |

### 4.2 State owners e caminhos entre processos

```text
Arquivo publicado do Repository
config/provider/zcode-builtin.json
        |
        +--> resolver de dev/package do Desktop
        |          |
        |          v
        |    Main -> schema de init do Host -> Services -> Provider Source
        |
        `--> build da CLI / asset SEA
                   |
                   v
            env/path resolver de runtime
                   |
                   v
             Provider Source

Repository pessoal, Account Source, Registry Overlay e Active Model não mudam.
```

| Estado/fato                     | Owner autoritativo                    | Resultado desta Tarefa                         |
| ----------------------------- | ------------------------------------ | ------------------------------------- |
| Conteúdo publicado nativo do ZCode | `config/provider/zcode-builtin.json` | Conteúdo inalterado, apenas o nome físico |
| Snapshot/revision do Source Node | `ZCodeBuiltinProviderConfigSource`   | Comportamento de watch/reload inalterado |
| Argumentos de inicialização do Desktop Host | Schema estrito compartilhado | Migrado atomicamente para o novo campo, sem leitura dupla |
| Caminho explícito da CLI       | `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Apenas a nova variável é reconhecida |
| Asset embutido do SEA          | `zcode-provider/zcode-builtin.json`  | Apenas a nova chave é empacotada/lida |
| Snapshot da configuração de provedor | Domínio de Provider            | Campos renomeados, resultado de parsing inalterado |
| Marcador Built-in das configurações | View do Facade de Settings | Passa a `isZCodeBuiltin`, comportamento de exibição inalterado |

### 4.3 Matriz de superfícies de UI

| Cenário do usuário       | Entrada              | Mudança visível nesta Tarefa | Invariantes obrigatórias                             |
| ----------------- | -------------------- | -------------------- | ------------------------------------------------ |
| Configurações de Provider     | Provider Settings    | Nenhuma; apenas o marcador interno de leitura foi renomeado | Exibição Built-in e capacidade de edição Personal inalteradas |
| Seleção comum de modelo      | Model selector       | Nenhuma                 | Ordem dos candidatos, enabled/visibility e estado de seleção inalterados |
| Off-Peak/modelos internos    | scoped Registry View | Nenhuma                 | Semântica de Provider oculto e de criação exata inalterada |
| Desktop/Web/celular  | Cada cliente             | Nenhuma                 | continuous/replayable, workspace remoto e filas inalterados |

Esta Tarefa não precisa de novos E2E de UI; testes unitários de Facade/Protocol do Provider e de
inicialização/build do Desktop/CLI cobrem a cadeia de nomenclação. As regressões de UI representativas
existentes servem apenas para provar que o comportamento não mudou.

## 5. Ordem de implementação

### A. Primeiro escrever testes que falham e portões mecânicos

1. Alterar para os nomes alvo os testes de Source, materializer, Snapshot, Resolver, Facade, init do Host,
   env de runtime da CLI e asset SEA;
2. Adicionar testes negativos de que “variável de ambiente antiga/caminho antigo não serão lidos”;
3. Estabelecer o comando `rg` exato da seção 7 desta Tarefa.

Como os testes e o código de produção mudam atomicamente no mesmo commit, é permitido que os testes não
compilem temporariamente em commits intermediários da renomeação, mas o commit final deve voltar ao verde
completo; não se mantém estado intermediário via alias.

### B. Domínio de Provider e Source Node

1. Renomear `ProviderConfigSnapshot`, a entrada do Resolver, a dependência/campo/event reason do Service e a
   entrada do Facade;
2. Nomear explicitamente o campo de regras de modelo como `zcodeBuiltinModelRules`, evitando que `Models`
   exprima simultaneamente membro e Rule;
3. Renomear o Source Node, o watcher, o materializer, a dependência de runtime, os nomes de arquivo e todos
   os exports/imports;
4. Unificar mensagens de erro e títulos de teste usando `ZCode Built-in Provider Config`.

### C. Services, Protocolo Compartilhado e Desktop

1. Alterar os parâmetros de composição dos Services e o campo de inicialização do Local Host para
   `zcodeBuiltinProviderConfigFilePath`;
2. Alterar diretamente o schema estrito de runtime em `packages/shared`, sem aceitar o campo antigo;
3. Sincronizar mensagens main/host do Desktop, caminhos de dev, caminhos de bundle/package e fixtures de teste;
4. Verificar que a cadeia de inicialização do Desktop local e do Host da mesma janela permanece inalterada; não
   alterar workspace remoto, mobile attachment nem protocolos de negócio.

### D. CLI, SEA, build e arquivos físicos

1. Alterar a variável de ambiente explícita para `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE`;
2. Alterar a chave de asset SEA para `zcode-provider/zcode-builtin.json`;
3. Alterar a descompactação de runtime e o nome de arquivo do materializer endereçado por conteúdo para
   `zcode-builtin-<hash>.json`;
4. Renomear atomicamente `config/provider/official.json` para `config/provider/zcode-builtin.json`;
5. Atualizar scripts de build/package, manifestos, testes e referências na documentação; o arquivo antigo e o
   asset antigo não permanecem em cópia.

### E. Projeção das configurações e zeragem da documentação

1. Alterar `isOfficial` para `isZCodeBuiltin` na View de Provider Settings;
2. Atualizar consumidores de Renderer/Protocol e testes, sem alterar regras de visibilidade e edição;
3. Alterar para Built-in a terminologia de configuração de provedor nos Designs vigentes, no Feature Graph, nas
   Tarefas de implementação e na documentação de desenvolvimento atual;
4. Logs de implementação históricos podem manter o nome antigo em citações históricas explícitas, se
   necessário para preservar a evidência original; eles não podem continuar sendo usados como API atual ou
   linguagem do design alvo.

## 6. Casos de aceitação estáveis

| Case ID | Setup                               | Action                             | Assertions                                                 |
| ------- | ----------------------------------- | ---------------------------------- | ---------------------------------------------------------- |
| ZBN-01  | Novo arquivo publicado existe      | Node Source inicia e observa atualizações | Parsing correto, comportamento de revision/watch inalterado |
| ZBN-02  | Mesmo conteúdo Built-in              | Materializa duas vezes              | Usa `zcode-builtin-<hash>.json` estável, conteúdo e semântica de escrita atômica inalterados |
| ZBN-03  | Desktop dev/package                 | Cria Local Host                    | Encontra a configuração e monta o Registry apenas pelo novo campo de init do Host |
| ZBN-04  | Nova variável de ambiente explícita da CLI | Inicia o Runtime              | Lê o novo caminho e gera a mesma View de Provider/Model   |
| ZBN-05  | Binário SEA                         | Inicia sem caminho explícito de arquivo | Descompacta apenas da nova chave de asset e monta a Configuração Built-in |
| ZBN-06  | Só a variável antiga é definida ou só o caminho antigo é fornecido | Inicia o Runtime   | Não lê a entrada antiga e falha com o erro formal de configuração ausente |
| ZBN-07  | View de Provider Settings           | Lê Provider Built-in e Personal    | `isZCodeBuiltin` correto, comportamento de UI e resultado de gravação inalterados |
| ZBN-08  | Mesma entrada Built-in/Account/Personal | Resolve snapshot antes e depois da migração | Ordem do Overlay, Configuração efetiva e candidatos do Registry equivalentes |

## 7. Portões de conclusão

### 7.1 Zeragem mecânica

Na cadeia formal de configuração de provedor, os seguintes nomes devem ter contagem zero:

```text
officialProviders
officialModels
officialSource
OfficialProviderConfigSource
createOfficialProviderConfigSource
materializeOfficialProviderConfig
resolveOfficialProviderConfigFilePath
officialProviderConfigFilePath
ZCODE_OFFICIAL_PROVIDER_CONFIG_FILE
config/provider/official.json
zcode-provider/official.json
isOfficial（apenas na semântica do marcador Built-in de Provider Settings）
```

Na aceitação, usar diretórios restritos e filtros semânticos para evitar falsos positivos em Official MCP,
Plugin, CUA ou textos de produto comuns. Executar também `dep:refs` para verificar que os exports antigos
não restaram por meio de barrel.

### 7.2 Validação automática

- Testes unitários afetados de Provider/Provider Node/Services/Shared/Desktop/CLI;
- Testes de resolução de caminho de dev e de package do Desktop;
- Testes de CLI para arquivo comum, env explícito e asset SEA;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm fmt:check`;
- Build afetado e `pnpm test:unit:affected`.

### 7.3 Condições de entrega

1. Não existem entradas paralelas com nomes antigo e novo;
2. O arquivo físico antigo, a variável de ambiente antiga e o asset SEA antigo saíram completamente de uso;
3. A saída de parsing da configuração de provedor e o comportamento do produto permanecem inalterados;
4. Design, Feature Graph, índice de etapas e conclusões de revisão apontam todos para esta Tarefa;
5. Implementação, testes e documentação são submetidos em um Conventional Commit.

## 8. Não-alvos

- Não refatorar o conteúdo da configuração, Overlay, Registry ou ModelFactory;
- Não alterar a configuração Account/Personal, o Access ou a autenticação de requisições;
- Não alterar a semântica de enabled, visibility, membros e conflitos de Provider/Model;
- Não modificar a seleção de modelo, Off-Peak, Automation, Subagent, Repo Wiki ou estado de tarefas;
- Não alterar a lógica Desktop continuous, Mobile replayable, workspace remoto, Queue ou recuperação;
- Não limpar conceitos de negócio `official` não relacionados à configuração de provedor;
- Não projetar migração e compatibilidade para uma nomenclatura antiga nunca publicada.

## 9. Resultado da implementação

- Domínio, Source Node, Services, init do Host compartilhado, Desktop, Server, CLI e SEA usam uniformemente
  `zcodeBuiltin` / `zcode-builtin`;
- O arquivo físico publicado, o arquivo materializado em runtime, a variável de ambiente e o asset SEA foram
  migrados de uma só vez para os nomes finais;
- O marcador de origem em Provider Settings passou a `isZCodeBuiltin`, sem manter o campo antigo;
- A variável de ambiente antiga existe apenas em testes negativos; o código de produção não lê variável, caminho
  ou asset antigos;
- Os testes direcionados de Provider, Provider Node, Desktop, Server e CLI e a verificação TypeScript de todo o
  repositório passaram.