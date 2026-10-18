# Design dos Caminhos de Runtime do E2E Desktop

## Contexto

Alguns specs de conversation E2E do desktop, fixtures de replay de provider e manifests de case gravam arquivos de runtime em `/tmp`. No macOS, Node.js e o Bash POSIX resolvem isso como o mesmo diretório; no Windows, o Node.js resolve `/tmp` para a raiz do disco atual, enquanto o Git Bash mapeia `/tmp` para o diretório temporário do usuário Windows. Por isso, a barreira entre processos pode apresentar a bifurcação "o spec já criou o arquivo de release, mas o Bash filho nunca o enxerga".

A sequência de produto do BG25 não tem anomalia. A falha ocorre antes do tool result do Bash filho, portanto o filho não recebe a pergunta seguinte do coordinator, e o pai também não consome a reply apenas de model. O objetivo da correção é unificar o sistema de coordenadas de arquivos do E2E, e não modificar o coordinator, a fila de comandos do runtime ou a semântica das notificações de background.

## Contrato de Caminhos

`.e2e-home` continua sendo o HOME isolado de todo o processo de teste; os arquivos temporários de case ficam unificados sob `.zcode-e2e/<case>` do workspace real de execução do Agente, `ZCodeProject`. Os logs de runtime já confirmam que o `workingDirectory` do filho aponta para cá, e não para o conversation backing workspace:

```text
.e2e-home/
└── ZCodeProject/                    Agent workspace cwd
    └── .zcode-e2e/
        ├── shared/
        └── <case>/                  case-owned runtime files
```

O mesmo arquivo é exposto de duas formas, conforme o consumidor:

```text
Node/spec/tool input: <native-or-portable absolute workspace>/.zcode-e2e/<case>/file
Bash command:         .zcode-e2e/<case>/file
```

- A API de arquivos do Node usa caminhos absolutos nativos.
- O input das provider tools como Read/Write/Edit/Glob/Grep usa caminhos absolutos normalizados com barra positiva; a API de arquivos do Windows aceita `C:/...`, de modo que a fixture não precisa lidar com escape de barra invertida em JSON.
- O Bash é iniciado a partir do workspace cwd e usa caminhos relativos POSIX independentes de plataforma, evitando conversão de drive do Windows, mount do Git Bash e diretório TEMP com espaços.
- Cada case limpa o próprio diretório; entradas somente leitura compartilhadas ficam em `.zcode-e2e/shared`.

## Variáveis da Fixture de Replay

O replay server recebe `fixtureVariables` estáticas e, após o carregamento da fixture e antes do matching da requisição, substitui recursivamente todas as strings. Fixtures de caminho usam `{{e2eRuntimeRoot}}`, cujo valor é calculado pelo WDIO a partir do `E2E_HOME_DIR` atual.

A substituição precisa cobrir matcher, prompt, tool input, corpo SSE bruto, chunks e events. O `{{latestAgentId}}` extraído por requisição continua sendo uma variável de resposta dinâmica, sem mistura com as variáveis de caminho estáticas.

O replay/capture server compartilha artifacts com o worker do WDIO entre processos. O writer deve gravar primeiro um JSON temporário completo e então substituir o arquivo de destino por rename, evitando que o reader leia um JSON pela metade entre o truncate e a escrita completa.

```text
fixture JSON
  -> parse
  -> apply static fixtureVariables
  -> request matcher
  -> apply request-derived latestAgentId
  -> replay response
```

## Escopo da Migração

Eliminar o `/tmp` cru no diretório de execução `packages/desktop/test/e2e`:

- conversation specs formal e manual-review/pending;
- fixtures de replay DeepSeek case-local e legadas;
- manifests de case;
- dados de teste E2E como bots harness e snapshots de ferramentas não registradas.

A migração não altera case ID, setup/action/assert, a classificação das requisições ao provider nem a timing policy. O uso de `tmpdir()` para criar diretórios temporários reais em unit tests comuns, assim como amostras de parser que nunca entram no sistema de arquivos de execução do E2E, não pertencem a este contrato.

## Proteção contra Regressão e Verificação

- Os testes unitários do replay server provam primeiro que variáveis estáticas podem participar do matcher e chegam ao tool input/raw response.
- Os testes unitários do contrato de caminhos varrem `packages/desktop/test/e2e` e proíbem reintroduzir `/tmp` cru.
- O fixture checker valida o contrato manifest/provider dos cases afetados.
- Replay direcionado cobre BG25, BG21, permission, tool-cross-product e outros consumidores reais de arquivos.
- Antes de concluir, executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint`.

## Não Objetivos

- Não modificar a semântica de desktop continuous, web remote replayable, snapshot, owner/lease ou workspace identity.
- Não introduzir novos runtimes de Agente, campos de protocolo ou estados main/relay.
- Não prometer execução de fixtures Bash POSIX via CMD; o E2E do Desktop no Windows continua usando o resolver Git Bash existente.