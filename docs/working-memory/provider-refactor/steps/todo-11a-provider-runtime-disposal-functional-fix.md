# 11A Correção funcional de liberação completa do Provider Runtime

> Status: concluído
>
> Data: 2026-08-25
>
> Natureza da tarefa: correção funcional encontrada na revisão de [`Todo 11`](./todo-11-provider-runtime-composition-boundary-cleanup.md)
>
> Design relacionado: [`../design/registry/runtime.md`](../design/registry/runtime.md)

## 0. Posicionamento da tarefa

Este documento corrige apenas o problema de o processo de Agent Protocol não liberar completamente os recursos do processo de Provider. É um defeito funcional encontrado na revisão do Todo 11,
mas não depende das decisões posteriores do Todo 11 sobre limites de composição do Runtime, nomenclatura e API pública, e pode ser implementado de forma independente.

Esta tarefa não mascara um problema de arquitetura com um fallback temporário. O sentido de "temporário" é: enquanto o Todo 11 como um todo estiver adiado, restaurar primeiro a semântica completa de liberação já declarada pelos objetos de ciclo de vida existentes;
quando o Todo 11 no futuro reorganizar a raiz de composição, o novo owner mais externo continuará assumindo a mesma responsabilidade de liberação.

## 1. Problema confirmado

O resultado mais externo retornado por `startProcessProviderRegistryRuntime()` possui os seguintes recursos:

```text
Process Provider Registry Runtime
|- Credential Store subscription（仅 Standalone Prompt/TUI）
|- Model Selection Config Repository
|  `- Node fs.watch
`- Node Provider Registry Runtime
   |- Provider Registry Service
   `- Provider Config watchers/repositories
```

O `dispose()` externo libera todos os recursos conforme a propriedade; o `runtime.dispose()` interno libera apenas os recursos de Registry e Provider Config.

O comportamento atual das entradas é inconsistente:

| Entrada        | Chamada de liberação atual                        | Resultado                                     |
| -------------- | ------------------------------------------------- | --------------------------------------------- |
| Prompt CLI     | externo `providerRegistryRuntime.dispose()`        | completo                                      |
| TUI            | externo `providerRegistryRuntime.dispose()`        | completo                                      |
| Protocol Agent | interno `providerRegistryRuntime.runtime.dispose()` | omite o Model Selection Repository           |

O ambiente de inicialização normal do Protocol Agent fornece o caminho do arquivo de Model Selection Config. O Repository cria um `fs.watch` persistente após o primeiro `read()`;
liberar apenas o Runtime interno não fecha esse watcher.

Portanto, a cadeia de saída atual é na prática:

```text
Protocol transport 关闭
        |
        v
Protocol finally 清理内层 Registry/Config
        |
        v
Model Selection fs.watch 仍存活
        |
        v
Node event loop 无法自然耗尽
        |
        v
CLI exit watchdog 到期后强制 process.exit
```

Isso não altera o resultado da seleção de modelo nem corrompe a configuração, mas converte erroneamente a saída normal do Protocol Agent em uma saída forçada dependente do watchdog.

## 2. Objetivo da correção

1. Na saída do Protocol Agent, chamar o `dispose()` mais externo do resultado retornado por `startProcessProviderRegistryRuntime()`;
2. Uma única chamada libera simultaneamente o Model Selection Repository, o Registry e os recursos de arquivo de Config;
3. Manter inalterado o comportamento de ciclo de vida atual do Prompt CLI, do TUI e do Host;
4. Após a saída, o watcher de Model Selection envolvido por esta tarefa não deve mais impedir o esgotamento natural do event loop;
5. Os testes passam a usar o owner mais externo como entrada de liberação, sem encobrir erros de propriedade ao liberar Repository e Runtime interno manualmente em separado.

## 3. Pontos de implementação

### 3.1 Primeiro adicionar testes que falham

- Adicionar ao Process Provider Registry Runtime um teste de liberação composta, provando que o `dispose()` externo libera o Model Selection
  Repository e continua liberando o Registry/Config interno;
- Adicionar asserções ao cleanup do Protocol Agent, provando que o finally chama o `dispose()` do owner completo, e não apenas o
  membro `runtime`;
- Alterar a combinação manual `modelSelectionConfigRepository.dispose()` + `runtime.dispose()` nos testes existentes para o `dispose()` externo,
  fazendo com que os testes respeitem o contrato de propriedade da produção;
- Os testes não devem depender do exit watchdog de um segundo da CLI para determinar o sucesso da limpeza.

### 3.2 Corrigir a entrada de limpeza do Protocol

Substituir a liberação interna no finally do Protocol Agent:

```ts
providerRegistryRuntime?.runtime.dispose();
```

pela liberação do owner mais externo:

```ts
providerRegistryRuntime?.dispose();
```

Continuar executando pelo `runProtocolCleanupStep` existente, garantindo que uma falha em uma etapa não pule o shutdown subsequente do Telemetry nem sobrescreva o erro original.

### 3.3 Manter a ordem de liberação atual

Não se redesenha o `dispose()` externo desta vez. Mantém-se a ordem atual:

1. Parar de receber novas mudanças de Standalone Credential;
2. Fechar o watcher do Model Selection Repository;
3. Liberar os recursos de Registry e Provider Config.

A entrada Protocol atualmente não cria subscription de Standalone Credential, portanto o vazamento real confirmado desta vez é apenas o watcher de Model Selection;
chamar o owner completo também garante que, quando novos recursos externos forem adicionados no futuro, o Protocol não os contorne novamente.

## 4. Não objetivos

- Não executar o achatamento do Runtime, a renomeação ou a refatoração da raiz de composição candidatos do Todo 11;
- Não remover `NodeProviderConfigRuntime`, `NodeProviderRegistryRuntime` ou o Services Runtime;
- Não decidir a API pública final dos recursos de Config do Node;
- Não mudar o status quo em que Host e Agent mantêm cada um seu Registry em processo;
- Não mudar as semânticas de leitura, salvamento, sincronização e valor padrão do Model Selection;
- Não ajustar o exit watchdog da CLI; o watchdog continua sendo o último fallback para handles residuais desconhecidos e não pode substituir a liberação normal pelo owner dos recursos;
- Não estender o tratamento à janela assíncrona limitada entre o início do refresh de Standalone Credential e o shutdown, a menos que os testes de implementação provem que ela constitui
  uma falha funcional independente.

## 5. Critérios de aceitação

- O finally do Protocol Agent chama somente o `dispose()` mais externo do Process Provider Registry Runtime;
- Depois de configurar o caminho do arquivo de Model Selection e ter executado `read()`, o dispose completo fecha o watcher correspondente;
- Após o dispose, o Model Selection Repository não pode mais ser lido nem gravado, e o Registry/Config interno também foi liberado;
- O comportamento de liberação externo existente do Prompt CLI e do TUI permanece inalterado;
- Quando outro recurso falha durante o cleanup, a liberação completa do Provider e o shutdown do Telemetry ainda são executados conforme as regras de bypass existentes;
- Os testes unitários relacionados passam;
- `pnpm typecheck`, `pnpm lint` e `pnpm fmt:check` passam;
- Após a conclusão, submeter um Conventional Commit.

## 6. Resultado da implementação

- O cleanup do Protocol foi alterado para liberar o owner completo retornado por `startProcessProviderRegistryRuntime()`, sem contornar mais o
  Model Selection Repository;
- O teste de ciclo de vida envolve o Process Runtime real e observa separadamente o dispose externo e o interno, provando que o Protocol chama apenas o owner externo;
- O teste de composição prova que, após o dispose completo, tanto o Model Selection Repository quanto o Node Provider Registry Runtime recusam novo uso;
- A combinação manual `repository.dispose() + runtime.dispose()` nos testes existentes foi unificada no dispose do owner;
- A revisão também encontrou que o importer do Standalone CLI ainda referenciava a projection Effective→Personal removida no Todo 35; isso foi alinhado ao Todo 35 e coberto com testes independentes, evitando que a migração legacy real do CLI se tornasse silenciosamente uma config vazia;
- 27 testes direcionados de Bootstrap, o typecheck do Bootstrap, o lint raiz, a verificação de formatação dos arquivos alvo e `git diff --check` passaram.