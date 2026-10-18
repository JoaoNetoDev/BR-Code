# Todo135: Restaurar os Headers padrão das requisições de modelo e a atribuição do OpenRouter

Status: **implementação, revisão item a item e validação local concluídas em 2026-09-12; a aceitação conjunta em máquinas reais (desktop/celular/SSH) não foi executada e nenhuma requisição foi enviada a serviços externos de modelo.**

### Contrato de implementação (2026-09-12)

- O Bootstrap reutiliza `buildCliZCodeSourceHeaders` para construir os `defaultHeaders` do ambiente de execução e os transmite pelo caminho existente Execution Config → Model Adapter → Model Execution; não lê o Provider Registry para inferir o ambiente de execução.
- Na Model Execution, ao vincular o Model, os headers de atribuição padrão existentes do OpenRouter são mesclados conforme o Provider Base URL desta execução, e então os headers do usuário são mesclados; a configuração padrão, a configuração do Provider e o Model já vinculado não são modificados in-place pelas mesclagens seguintes.
- A mesclagem de headers reutiliza a mesma função de sobrescrita case-insensitive; a autenticação no momento da requisição continua sobrescrevendo por último os headers sob sua responsabilidade, sem alterar as responsabilidades de validação de segurança da requisição, de rastreamento e de atualização em runtime.
- Atualmente o Desktop local injeta a versão do cliente por `ZCODE_APP_VERSION`; o comando de inicialização remota também passa essa variável; o ponto de entrada de protocolo passa explicitamente `sourceTitle: electron`. Mantém-se o comportamento de a variável de ambiente ter precedência sobre a versão do próprio Worker, e a CLI independente usa a montagem de versão e origem já existente.
- Não são introduzidas mudanças de sincronização de estado, cache, IO, protocolo ou persistência; desktop continuous / mobile replayable continuam sob responsabilidade do encadeamento original. Título, Wiki, subtarefas e teste de conexão consomem a fábrica pública de modelos, sem novo preenchimento de headers no lado do negócio.

## Objetivo e causa raiz

Restaurar dois comportamentos que ficaram de fora durante o refactor de Providers: os headers padrão genéricos das requisições reais de modelo e o header de atribuição específico do OpenRouter. A geração de título é um ponto de entrada já reportado, mas não se pode corrigir apenas a geração de título.

Comparação de linha de base: `e7921fb5d484d9c9d22d2e638064163fd13143a6` em `origin/main`; código investigado: `d9b071cdae`.

- O antigo `createDefaultProviderHeaders()` mesclava as informações de origem e a atribuição do site ao construir o Provider, e depois permitia que os headers do usuário sobrescrevessem.
- O `toAiSdkProviderConfig()` atual em `model-execution.ts` copia apenas `config.api.headers`, e as requisições públicas de modelo ficam sem as informações de origem padrão.
- O construtor de origem ainda existe, e o `NodeApiClient` de negócio, a consulta da flag de validação de segurança e a consulta de configuração de roteamento também têm injeção, mas as requisições reais do SDK de modelo não passam por essas saídas de negócio, o que não pode ser tratado como equivalente.
- `withOpenRouterAttributionHeaders()` ainda existe, mas o construtor de origem atual da CLI recebe `undefined` e portanto não casa com o OpenRouter.
- A autenticação de conta, os headers customizados, a validação de segurança da requisição e o rastreamento da requisição já têm implementações independentes e não foram perdidos por completo. O `X-Client-Version` em caso de validação de segurança bem-sucedida não substitui a declaração de versão do cliente de todas as requisições de modelo.

## Requisitos de correção

### 1. Headers padrão genéricos

Reutilizar a capacidade existente de construção de origem e conectá-la pela montagem do ambiente de execução à fronteira pública de requisições de modelo, sem restaurar o Registry antigo e sem preencher headers separadamente nos negócios de título, Wiki, Subagent etc.

| Categoria | Conteúdo padrão restaurado |
| --- | --- |
| Versão do cliente | `User-Agent: ZCode/<version>`, `X-ZCode-App-Version` correspondente à versão válida |
| Origem do produto | `HTTP-Referer`, `X-Title: Z Code@electron/cli`, `X-ZCode-Agent: glm` |
| Ambiente | `X-Release-Channel`, `X-Client-Language`, `X-Client-Timezone` |
| Plataforma | `X-Platform`, `X-Os-Category`, `X-Os-Version` |

- Preservar a relação de montagem entre versão explícita do cliente, origem e ambiente, sem confundir a versão do SDK ou a versão do próprio Worker remoto com a versão do cliente desktop; revisar a passagem de origem existente do local, do Worker remoto e da CLI independente.
- Preservar a normalização de valores e a semântica de valores ausentes existentes, sem escrever em headers sequências de linha inválidas; quando uma versão válida já for fornecida, ela deve ser realmente enviada, sem se transformar silenciosamente em `unknown`.
- Não escrever headers de ambiente de execução na configuração Built-in/Personal e não adicionar migração de dados.

### 2. Atribuição do OpenRouter

- Reutilizar a ferramenta existente de casamento de URL e atribuição, passando o Provider Base URL realmente configurado; não adivinhar pelo nome de exibição ou pelo Provider ID.
- Em caso de acerto, preencher por padrão `X-OpenRouter-Title: ZCode` e `X-OpenRouter-Categories: programming-app`; não preencher para sites que não sejam OpenRouter.
- Preservar a fronteira existente de HTTPS, domínio e subdomínio, sem ampliá-la para sites com nome semelhante.

### 3. Manter as fronteiras de composição existentes

```text
Ambiente de execução → headers padrão genéricos + atribuição padrão do site
                              ↓
              sobrescrita pelos headers do usuário do Provider
                              ↓
      tratamento existente de autenticação / rastreamento / validação de segurança
                              ↓
                requisição de rede final do SDK
```

- Os headers de origem padrão e do site podem ser sobrescritos explicitamente pelo usuário; a mesclagem deve respeitar a semântica case-insensitive de nomes de header HTTP, sem gerar concatenação duplicada.
- Não alterar a autoridade, a ordem de execução e as regras de fallback existentes de autenticação, validação de segurança da requisição e atribuição da requisição; não criar um mecanismo paralelo.
- O `X-Device-Mid` suportado pelo construtor compartilhado não faz parte do escopo desta restauração e não deve ser enviado a serviços de modelo de terceiros só por reaproveitamento.
- Não alterar a sincronização de status da conta, a seleção de modelo, a UI, o corpo da requisição nem a semântica desktop continuous/celular replayable; o celular continua reaproveitando a cadeia de execução shared-host.

## Checklist de implementação e aceitação

- [x] Primeiro adicionar testes de requisição de rede final que reproduzam o esquecimento, e só então implementar; não basta afirmar apenas o valor de retorno do helper ou o objeto de configuração da validação de segurança.
- [x] Cobrir `generateText` / requisições em streaming e os três formatos de API na saída pública de modelos; cobrir API Key comum, caminho de conta e validação de segurança desativada/em fallback, confirmando que a declaração padrão de versão não depende do sucesso da validação de segurança.
- [x] Tomar a geração de título como regressão principal; revisar se a sessão principal, Subagents explícitos/herdados, Wiki e teste de conexão passam pela mesma saída corrigida;desvios existentes precisam ser conectados ou registrados explicitamente, sem cópia por negócio.
- [x] Cobrir acerto/não acerto do OpenRouter, sobrescrita por headers customizados com variação de caixa, valores de ambiente ausentes/inválidos; confirmar que a autenticação existente, os headers de rastreamento e o conteúdo da requisição não regridem.
- [x] Comparar a montagem de origem do desktop local, do Worker remoto e da CLI independente, validando que a versão do cliente e a origem estão corretas; marcar honestamente os itens não testados em ambiente real.
- [x] Executar em conjunto os testes unitários relevantes, a verificação de tipos, o lint e a verificação de arquitetura; capturar a requisição real do SDK com transport injetado/serviço local, sem substituir a asserção no fio por testes de construtor. Não é necessário rodar uma regressão desktop de grande escala a cada pequena alteração.
- [x] Depois de concluído, fazer review item a item segundo os dois objetivos acima, confirmando ausência de lacunas, de implementação duplicada e de propagação de campos de identidade extras, e então submeter a implementação e as evidências.

## Resultado da implementação e revisão pós-conclusão

- Linha de base: `27eba110b4`; antes da execução, a verificação de frescor e a de arquitetura passaram; o `origin/main` buscado novamente continua sendo `e7921fb5d4`.
- Headers genéricos: o construtor de origem existente entra na Model Execution pública por `defaultHeaders`. Não foi criado outro construtor de origem, nem os headers foram escritos no Registry / Built-in / Personal.
- OpenRouter: removida do Bootstrap a chamada de atribuição inválida que passava `undefined`; na vinculação do modelo, o matcher original é reutilizado conforme o Base URL real. Os testes cobrem o domínio oficial, subdomínios, sufixos falsos e ausência de HTTPS.
- Mesclagem: extraído o algoritmo de sobrescrita case-insensitive originalmente usado na autenticação da requisição, agora compartilhado entre valores padrão, valores do usuário e autenticação; a prioridade desta última permanece inalterada. A construção e a requisição usam cópias, de modo que o Model antigo não muda com a nova configuração do Provider e não há vazamento de autenticação entre requisições.
- Revisão da cadeia de chamadas: o `new AiSdkModelAdapter` de produção existe apenas no Bootstrap `model-factory.ts`, montado por `create-app.ts`; a sessão principal e os runtimes filhos reutilizam essa fábrica. O sidecar de título usa `createRuntimeModel`; Wiki e teste de passagem pelo session facade → workspace runtime → mesma fábrica. Não foi encontrado nenhum desvio de produção que exija preenchimento de headers no lado do negócio; ModelAdapters alternativos injetados explicitamente pelo chamador continuam sob responsabilidade do chamador.
- Especialização de título: `AgentRuntime.maybeStartSessionTitleGenerationFromExternalInput` real → sidecar → Model → SDK real → captura via fetch injetado, com asserções sobre o Prompt de título original, a escrita do título de volta, a versão, o tipo other e os headers de Session/Trace; não é apenas a reprodução de um trecho de Prompt de título.
- Atribuição de versão: o `desktopRuntimeEnv.ts` injeta a versão no desktop, o `remote/connect.ts` passa a versão no SSH, o ponto de entrada de protocolo declara electron explicitamente e a CLI independente usa a detecção de origem original. Os testes confirmam que a versão do ambiente do cliente tem precedência sobre a versão do Worker; as informações de sistema operacional continuam representando a máquina de execução real, de acordo com o main.
- Arquitetura: a configuração de infraestrutura é transmitida pela fronteira original Bootstrap → Adapter. O módulo é legacy/unmanaged `zcode-cli`, sem novos módulos, state owners, cache, notificações ou protocolo; não afeta a ordem de eventos nem a semântica de recuperação de continuous/replayable.
- Não tocado: contas reais, configuração do usuário, banco de dados, seleção de modelo, corpo da requisição, validação de segurança e estratégias de fallback. Nenhum `X-Device-Mid` extra foi injetado.

### Evidências de validação

| Escopo | Resultado | Log local |
| --- | --- | --- |
| Bootstrap wire, montagem de origem, Registry, runtime headers | 6 arquivos, 39 casos aprovados; incluindo 20 novos testes de requisição final | `/tmp/todo135-bootstrap-tests.log` |
| Headers do Adapter, autenticação e vinculação, requisições de modelo | 5 arquivos, 55 casos aprovados; incluindo 2 novos testes de mesclagem/vinculação | `/tmp/todo135-adapters-tests.log` |
| Validação de segurança e roteamento de endpoints do Coding Plan manual existente | 2 arquivos, 47 casos aprovados | `/tmp/todo135-signing-tests.log` |
| Ambiente do Desktop, comando de inicialização remota, matcher do OpenRouter | 3 arquivos, 43 casos aprovados, 4 casos exclusivos de macOS pulados no Linux | `/tmp/todo135-source-tests.log` |
| Tipos da raiz, tipos do Bootstrap, build do Adapter | aprovado | `/tmp/todo135-typecheck.log`、`/tmp/todo135-bootstrap-typecheck.log`、`/tmp/todo135-adapters-build.log` |
| Verificação de tipos estrita e isolada dos testes novos/modificados | aprovado, usando NodeNext / ES2023 / strict | `/tmp/todo135-test-types.log`、`/tmp/todo135-adapter-test-types.log` |
| Lint da raiz, lint dos arquivos alterados da CLI, arquitetura | raiz com 0 errors / 42 warnings já existentes; CLI com 7 arquivos e 0 warnings/errors; arquitetura com 0 violations | `/tmp/todo135-lint.log`、`/tmp/todo135-cli-lint.log`、`/tmp/todo135-architecture.log` |

O lint da raiz exclui a CLI por padrão, portanto uma configuração temporária com as mesmas regras de max-lines e as mesmas exceções de teste foi usada para verificar de fato os arquivos alterados da CLI; a configuração de lint do repositório não foi modificada. Os testes do Bootstrap usam a exportação de pacote do Adapter, então o Adapter é construído primeiro, evitando validar o código atual contra um dist antigo.

Os testes de fio escritos primeiro confirmaram, sobre a implementação antiga, a ausência da versão do ZCode e do header do OpenRouter; em seguida foram complementados o fixture de autenticação de conta e a resposta em streaming, antes de concluir a regressão. Os testes de validação de segurança usam chaves falsas diferentes para isolar o cache de flag em nível de processo, sem resetar o cache de produção nem acessar serviços reais. O primeiro teste de vinculação tentou alterar diretamente a configuração congelada do Registry e foi corretamente rejeitado; foi ajustado para criar uma nova configuração e então vincular, sem afrouxar a proteção de congelamento.

Limitações de máquina real: desta vez não foram executadas requisições de modelo em Electron real, shared-host de celular, workspace SSH ou validação em máquinas completas Windows/macOS. Os casos de passagem de ambiente e as requisições do SDK com transporte de rede injetado comprovam o encadeamento do código, mas não substituem essas evidências em máquina real.

Este item não autoriza publicação de configuração em produção, modificação de dados reais de usuário nem push automático; a implementação e o registro foram submetidos na branch de trabalho atual.