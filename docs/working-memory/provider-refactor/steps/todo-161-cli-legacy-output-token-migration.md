# Todo161: primeira migração do CLI preserva o limite de saída do `config.json` antigo

Status: em 2026-10-14 reposicionado com base no staging mais recente; a correção de produção, as 61 regressões
direcionadas e as checagens estáticas necessárias passaram; o registro de verificação atual está na seção final.
O resultado de setembro é mantido como evidência histórica.

## Contexto e conclusões da investigação

O time de avaliação ainda usa o `config.json` antigo, no diretório de configuração do CLI, para definir o Provider
e o limite de saída do modelo, e precisa que esse valor seja preservado na primeira importação das novas
configurações de Provider.

- A origem padrão é `~/.zcode/cli/config.json`, localizada por `getDefaultConfigPath()`; o ponto de injeção
  existente do Standalone, `legacyCliUserConfigFilePath`, continua disponível.
- O [parser do formato antigo](../../../../apps/zcode-cli/packages/bootstrap/src/app/legacy-cli-model-config.ts)
  já aceita `maxOutputTokens`, `limit.output` e `options` do modelo.
- A projeção de membros do [importador do CLI](../../../../apps/zcode-cli/packages/bootstrap/src/app/legacy-cli-personal-provider-config-importer.ts)
  mantém apenas `contextWindow`, e a criação das regras de modelo ainda pula membros sem contexto, o que
  provoca a perda do limite de saída.
- O [teste da configuração antiga](../../../../apps/zcode-cli/packages/adapters/tests/config.test.ts) registra a
  prioridade `limit.output` → `options.max_tokens` → `maxOutputTokens` no nível superior do modelo.
- O [teste atual de importação](../../../../apps/zcode-cli/packages/bootstrap/tests/legacy-cli-personal-provider-config-importer.test.ts)
  ainda tem a asserção "não migra o limite de saída das opções de modelo históricas", que precisa ser ajustada
  conforme a decisão deste item.

Na investigação de 2026-09-16 a execução dos testes de importação do CLI teve 5 aprovações e 8 falhas em 13
casos, envolvendo principalmente testes que ainda faziam asserções sobre a estrutura de serialização antiga; essa
é a evidência anterior à modificação, não o resultado da correção deste item. A máquina atual não possui o arquivo
de configuração antigo padrão acima, a amostra real do time de avaliação ainda não foi conferida e nenhuma Key nem
configuração completa de usuário foi salva.

## Escopo confirmado e contrato de campos

1. Modifica-se somente a **primeira importação da configuração antiga do CLI Standalone**, com entrada em
   `provider.<providerId>.models.<modelId>` do arquivo antigo do usuário. Reutilizam-se as regras existentes de
   identidade de Provider, origem, itens removidos e filtragem de membros duplicados.
2. O limite de saída é obtido como inteiro positivo válido na ordem `limit.output` → `options.max_tokens` →
   `maxOutputTokens` e gravado em `config.optionSpecs.maxOutputTokens.max` da nova regra de modelo
   correspondente. Não se materializa a configuração completa do modelo Built-in, nem se copiam o mapeamento de
   parâmetros de API ou options arbitrários; o map continua sendo fornecido pela cadeia de síntese de
   configuração existente.
3. Modelos que têm apenas limite de saída, sem `contextWindow`, também devem gerar regra; quando ambos existem,
   ambos são preservados. Quando ambos estão ausentes, o comportamento atual é mantido e, na ausência do campo
   de saída, nenhum valor padrão é gravado.
4. Valores inválidos não entram na nova configuração, mantendo o limite de validação de entrada do parser atual;
   testa-se explicitamente a prioridade dos candidatos válidos e o tratamento de valores de options inválidos,
   sem aceitar string ou decimal por conversão numérica implícita.
5. **Usuários já migrados não são tratados.** Quando a configuração Personal oficial já existe, o comportamento de
   leitura direta é mantido: sem migração adicional, sem sobrescrita, sem versão ou marcador de migração e sem
   leitura contínua do arquivo antigo. Se a avaliação alterar o limite de saída no arquivo antigo e iniciar
   novamente, a efetividade continua sujeita a esse limite de primeira importação.
6. Não se modifica o `legacyPersonalProviderConfigImporter` do Desktop, e não se importam valores de saída do
   Store antigo do desktop, das configurações de projeto ou de variáveis de ambiente. O arquivo antigo original
   do CLI é preservado, sem escrita dupla.
7. Não se estendem campos de compatibilidade adicionais como `options.extra_body.max_tokens` ou
   `max_completion_tokens`, e não se alteram o nível de raciocínio, a conta, a seleção padrão ou outras semânticas
   de migração; este item implementa apenas os três campos de limite de saída confirmados nesta rodada.

A ordem de migração e execução segue o único owner de persistência de [Todo33](todo-33-personal-provider-config-file-cutover.md):

```text
Standalone Provider Runtime
  → Personal Repository verifica o arquivo oficial
      ├─ já existe: lê a configuração oficial e encerra a importação do arquivo antigo
      └─ não existe: reconfere dentro do lock → CLI Legacy Importer lê o config.json antigo
                 → extrai as regras esparsas de context / output
                 → salva atomicamente a configuração Personal → Registry sintetiza → requisição normal de modelo
```

Este item substitui a expectativa "o limite de saída não é migrado" nos testes de importação do CLI; não amplia a
compatibilidade do Desktop nem de usuários já migrados.

## Implementação e aceitação

- [x] Antes da implementação, a especificação de migração vigente aplicável foi sincronizada com o contrato
  final acima; o registro histórico é preservado, para evitar que descrições de fases antigas sejam tomadas como
  comportamento atual.
- [x] Primeiro foram adicionadas as regressões: migração de cada um dos três campos, prioridade quando coexistem,
  apenas output, context e output juntos, output ausente e valores inválidos, remoção e filtragem de modelos
  duplicados; provou-se que a implementação antiga perdia valores e só então o importador do CLI foi modificado.
- [x] Corrigiram-se as asserções de serialização obsoletas naquele arquivo de teste de importação, priorizando
  asserções sobre as regras e os campos oficiais atuais; a correção incidental das asserções não foi estendida
  a outras mudanças de semântica de produto.
- [x] Com um diretório temporário de configuração do CLI e fixture de Provider offline, foram cobertos leitura do
  arquivo antigo → primeira importação → salvamento e releitura do arquivo oficial → síntese do Registry; foram
  verificados a preservação do valor explícito de saída, a herança do API map e a invariância do conteúdo do
  arquivo antigo.
- [x] Com a configuração oficial presente, alterou-se o valor de saída no arquivo antigo e reiniciou-se, confirmando
  que não há nova importação; este item não promete leitura contínua da configuração antiga da avaliação.
- [x] Com um Provider local roteirizado, capturou-se a requisição real de modelo do CLI, provando que o valor
  migrado entra no campo de orçamento de saída da API correspondente; a gravação bem-sucedida do JSON não é
  usada como substituto da verificação de efeito na requisição, e nenhuma Key real ou modelo pago é usado.
- [x] Executaram-se os testes afetados, typecheck, lint e checagem de arquitetura segundo as regras da raiz e do
  CLI, com auto-revisão; distinguem-se explicitamente as falhas preexistentes, o resultado desta rodada e o que
  não foi verificado. Os comandos de teste podem começar por
  `pnpm --dir apps/zcode-cli --filter @zcode/bootstrap exec vitest run tests/legacy-cli-personal-provider-config-importer.test.ts`,
  e os testes unitários da raiz não substituem a verificação do CLI.

## Registro de implementação e verificação de 2026-09-17

A mudança de produção ficou apenas no CLI Legacy Importer: foi obtida a primeira prioridade como inteiro positivo
finito, gerando regras esparsas para modelos com apenas valor de saída ou com context/output coexistindo; o parser,
o importador do Desktop, o ciclo de vida do Repository e o Schema de persistência não foram alterados. A
especificação vigente de configuração e as decisões posteriores do Todo35 foram sincronizadas, e os testes de
importação antigos passaram a fazer asserções sobre a estrutura de regras atual.

- Executando primeiro as regressões sem modificar a implementação, 17 de 34 casos falharam, com todas as falhas
  apontando para regras de saída válida ausentes; após a modificação, 40 casos passaram entre importação, limites
  de campo, integração de seleção padrão e integração de requisição local. Também foram executados os testes de
  chamadores do Registry de processo e da fábrica de modelos, com 19 casos passando, totalizando 59.
- O novo teste de runtime usa um `config.json` temporário do CLI, a raiz de composição real do Standalone, o
  arquivo Personal e o Registry para iniciar um Turn normal do Agent, enviando uma requisição real do SDK a uma
  fixture HTTP local. As três APIs — `max_tokens`, `max_completion_tokens` e `max_output_tokens` — capturaram
  `24000`; o orçamento da requisição não foi especificado manualmente pelo chamador do teste. A fixture retorna
  400 de propósito para encerrar a rodada; o alvo da verificação são os parâmetros de saída, e isso não
  representa sucesso de geração do modelo upstream.
- O teste de reinício lê o arquivo oficial já gravado em disco; mesmo com o arquivo antigo alterado para `8000`,
  o Registry permanece em `24000` e os bytes do arquivo oficial não mudam. A primeira importação também confirma
  que os bytes do arquivo antigo não mudam, e nenhuma Key real ou modelo pago foi acessado.
- `pnpm typecheck`, `pnpm lint` (54 warnings / 0 errors), `pnpm --dir apps/zcode-cli typecheck` (28 tasks) e
  `pnpm architecture:check --changed` (0 violations) passaram. Na política de arquitetura o CLI é um módulo
  legacy, e a aprovação do gate não equivale a uma prova completa de runtime.
- Passaram a checagem de lint e de formatação local dos 4 arquivos TypeScript desta rodada, a verificação de diff e
  de links de documentação.
- `pnpm --dir apps/zcode-cli lint` falhou: por exemplo, 5 erros de `max-lines` em arquivos não modificados —
  `contracts/src/workflow/index.ts`, `interfaces/session-store.port.ts`, `interfaces/browser-control.port.ts`,
  `events/event-reducer.ts`, `model/index.ts`; o Bootstrap ainda tem arquivos preexistentes acima do limite, como
  `plugins.ts`. Os exemplos foram comparados com o HEAD e não têm alterações. A falha não foi contornada mudando
  as regras ou ampliando a refatoração.

Não foram verificados a configuração real do time de avaliação, a resposta de sucesso de um modelo externo nem
execuções reais em Windows/macOS; este item não alterou a interação do desktop nem do celular. O lint completo do
CLI ainda não foi fechado, e não se afirma que todas as verificações necessárias passaram; ciente dos erros de
linha preexistentes, o usuário pediu explicitamente o commit direto, e assim esta rodada foi submetida conforme a
autorização, mantendo o registro de falha. O workspace continha ao mesmo tempo alterações de outras tarefas, que
esta rodada não modificou nem incluiu.

## Reposicionamento com base no staging em 2026-10-14

O commit de correção antigo `bb7f88002c` permaneceu na branch de feature antiga e não entrou no staging. Desta
vez uma branch de correção independente foi criada a partir de `5e74234f49`, portando apenas a correção, os testes e
a especificação deste item, sem trazer as demais funcionalidades da branch antiga.

- A lógica de conversão de produção reaproveita a correção original; os testes do staging atual já corrigiram a
  estrutura de serialização, e essas asserções foram mantidas, apenas acrescentando a expectativa de orçamento de
  saída.
- Na execução real verificou-se que `createSqliteSessionStore()` passou a ser uma fábrica assíncrona; a fixture de
  integração de requisição passou a aguardar a inicialização, sem alteração no armazenamento de produção nem na
  cadeia de requisições.
- Antes da modificação da implementação de produção, 17 das 34 regressões de importação falharam por perda do
  limite de saída; após a correção, 61 casos passaram nos 6 arquivos de teste relacionados, incluindo as regressões
  novas adicionadas pelos chamadores existentes.
- As requisições reais do SDK das três APIs foram capturadas pela fixture HTTP local em `24000`; a releitura do
  arquivo oficial, a invariância do arquivo antigo e a ausência de nova importação no reinício continuam
  passando. O 400 retornado pela fixture é um desenho de teste que encerra a requeração ativamente, e não
  representa uma resposta de sucesso de um modelo externo.
- A pré-visualização e a execução efetiva do affected da raiz selecionaram 0/2633; o CLI não faz parte do suite de
  testes da raiz, sendo coberto pelas regressões direcionadas do CLI acima. Não se executou a suíte completa de
  testes unitários.
- O `pnpm typecheck` da raiz e o `typecheck` do CLI (30 tasks) passaram; o lint da raiz ficou em 0 errors / 210
  warnings e o do CLI em 0 errors / 68 warnings, com mais 14 diagnósticos de contagem de linhas do upstream
  aceitos como estão conforme a política vigente. Não há mais o bloqueio de contagem de linhas de setembro.
- `pnpm architecture:check --changed` ficou em 0 violations; os 4 arquivos TypeScript passaram na checagem de
  formatter próprio do CLI, e as verificações de diff, de referências a documentação e de vocabulário de open
  source passaram. Só se verificou o escopo da tarefa atual, sem ampliar para a suíte completa.
- Não foram verificados a configuração real de avaliação, a resposta de sucesso de um modelo externo nem execuções
  reais em Windows/macOS. O escopo de produto continua restrito à primeira migração do CLI; a preparação da branch
  local não significa que ela já foi mesclada no staging remoto.
