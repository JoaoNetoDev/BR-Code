# Todo 67: fechamento da completude da Selection antes da criação formal do Model

> Status: Completed
>
> Origem: regressão em máquina real do teste de conexão de Account Provider e Review da entrada de execução completa

## 1. Contexto e causa raiz

O Provider Registry já definiu `reasoningLevel` como um fato obrigatório da Selection de execução. O ModelFactory
apenas valida e monta a Selection completa, sem mais adivinhar defaults para o chamador.

Embora o teste de conexão já tenha decidido usar o nível público mais baixo do Reasoning Spec do modelo, `values[0]`, a implementação atual tem a ordem de execução errada:

```text
设置页只提交 providerId/modelId
            |
            v
ModelFactory 先校验 Selection
            |
            X reasoningLevel 缺失

原计划中的 values[0] 绑定发生在 Model 创建之后，因此永远到不了。
```

Esta é uma falha local determinística, não um problema de plano de Account, header de requisição, credenciais ou rede do servidor.

Este Review também encontrou Selection incompleta do mesmo tipo na geração da mensagem de commit do Git, no salvamento do modelo explícito do Subagent e na entrada dividida `model`/`thoughtLevel` da criação de Session. O Title Generation Model Override explícito tem a mesma lacuna contratual potencial.

## 2. Princípio unificado

### 2.1 Selection de identidade e Selection de execução

`ModelSelection` ainda pode servir como identidade de modelo em processos cruzados, no armazenamento histórico e na seleção da UI, portanto não se pode tornar o Reasoning globalmente obrigatório no Schema compartilhado.

Toda Selection de execução que entra no ModelFactory formal deve já conter um `reasoningLevel` válido suportado por aquele modelo:

```text
身份 Selection
      |
      v
拥有 Registry 的选择/创建边界
      |
      v
完整执行 Selection
      |
      v
ModelFactory
```

Não se pode afrouxar o ModelFactory, restaurar fallback em Runtime, nem adivinhar o nível a partir do Provider ID, modelId ou de strings como `off`/`nothink`.

### 2.2 Seleção normal e requisições auxiliares

- quando o usuário seleciona um modelo normalmente, o nível default continua sendo o último item do `values` ordenado;
- requisições auxiliares como teste de conexão, mensagem de commit do Git e geração de título usam o nível público mais baixo, `values[0]`;
- `values[0]` não equivale à string `disabled`;
- não se adiciona `reasoningLevelPolicy` nem outra abstração de default;
- o orçamento de saída continua sendo vinculado explicitamente pelas regras já existentes de cada requisição auxiliar.

## 3. Escopo de implementação

### 3.1 Teste de conexão do Provider

O teste de conexão continua submetendo apenas a identidade Provider/Model a partir da página de configurações. A fronteira App/Bootstrap que possui o Registry oficial lê `optionSpecs.reasoningLevel.values[0]` do Model alvo, forma primeiro a Selection de execução completa e só então chama o ModelFactory.

O Core mantém os bindings auxiliares já existentes:

- `reasoningLevel = values[0]`;
- `maxOutputTokens = min(5000, optionSpecs.maxOutputTokens.max)`.

Não se deve adicionar branch de Account, Start, Individual, Team ou de modelo específico.

### 3.2 Geração da mensagem de commit do Git

O provedor de modelo atual já devolve a Selection completa do Host. O gerador do Git não deve mais remover ativamente `options`; a Selection completa deve entrar tal qual na fronteira formal de criação do Model. O Core ainda faz bind do nível mais baixo na requisição auxiliar real do Git,
portanto isso não faz a requisição do Git herdar o Reasoning alto da sessão interativa.

Remover a antiga asserção de teste que escrevia "descartar o Reasoning interativo" como "descartar a Selection completa".

### 3.3 Modelo explícito do Subagent

O controle de seleção de modelo já exibe o Reasoning default normal segundo o Registry. Ao salvar um modelo explícito de Subagent, o nível já resolvido deve ser persistido junto com o Provider/Model, não pode mostrar um valor e salvar `undefined`.

Valores históricos ausentes só podem ser completados uma única vez em uma fronteira explícita de leitura/migração; o ModelFactory não faz fallback.

### 3.4 Criação de Session

O protocolo mantém temporariamente os campos de compatibilidade `model` e `thoughtLevel`. Antes de construir o App/Runtime Config, eles são mesclados atomicamente:

- usa-se `model.options.reasoningLevel` quando ele já existe;
- caso contrário, usa-se o `thoughtLevel` independente;
- quando nenhum dos dois existe, a fronteira de seleção do Registry oficial faz uma nova seleção normal, e não é permitido enviar uma Selection incompleta antes ao ModelFactory.

Depois disso, `setModel`/`setThoughtLevel` respondem apenas por eventos de estado da sessão e deixam de carregar a precondição de o primeiro Model poder ser criado.

### 3.5 Override explícito de Title Generation

A geração normal de título usa a Selection completa atual da Session, sem mudar o comportamento. Caso o `titleGeneration.modelSelection` explícito seja mantido, sua fronteira de produção/carregamento deve garantir completude, sem depender de fazer bind do nível mais baixo depois de criar o Model. Entradas antigas sem chamador de produção devem ser removidas antes de se criar um branch de compatibilidade novo.

## 4. Teste primeiro

Escrever primeiro os testes que falham, depois alterar o código de produção:

1. usando o Provider Registry e o ModelFactory oficiais, enviar ao teste de conexão apenas a identidade Provider/Model e provar que o Adapter recebe `values[0]` e o orçamento de saída limitado;
2. cobrir parametrizadamente API Key, Start Plan e Team Plan, provando que não há especialização por Provider;
3. o gerador do Git preserva a Selection de entrada completa, enquanto a requisição oficial acaba usando `values[0]`;
4. trocar o modelo do Subagent e não tocar no controle de Reasoning ainda salva o nível legal exibido na interface;
5. Session Create mescla Model/Thought divididos antes de construir o App;
6. se o Title Override explícito for mantido, validar com teste oficial apoiado no Registry;
7. o E2E de Provider Settings do Desktop precisa clicar de verdade no botão de teste de conexão, não basta checar a página de Account e a lista de modelos.

Os testes unitários do Core com ModelFactory falso podem ser mantidos para verificar o comportamento de bind, mas não podem mais ser tratados como prova vertical do Registry.

## 5. Critérios de conclusão

- o teste de conexão de Account Provider e API Key Provider não reporta mais Reasoning ausente;
- o teste de conexão realmente usa `values[0]` e não reconhece nenhum Provider/modelo específico;
- Git, Subagent e Session Create não enviam mais Selection de execução incompleta ao ModelFactory;
- o comportamento de chat normal, Compact, Memory, Repo Wiki, Automation, Bot e Off-Peak não muda;
- não houve afrouxamento do Registry/ModelFactory nem um segundo conjunto de fatos default de Reasoning;
- os testes unitários direcionados, a verificação de tipos do Desktop E2E, o `pnpm typecheck` e o `pnpm lint` na raiz passam;
- ao final, reauditar todos os pontos de chamada do ModelFactory oficial e registrar as limitações de ambiente E2E real ainda não verificadas.

## 6. Registro da implementação

A primeira rodada de correção cobriu as duas entradas que de fato enviavam Selection incompleta ao ModelFactory oficial:

- o teste de conexão de Provider passou a preencher `values[0]` do modelo alvo na fronteira Registry do Bootstrap/App antes de criar o Model; o orçamento unificado de requisição auxiliar do Core permanece inalterado;
- a geração da mensagem de commit do Git não stripa mais os `options` da Selection atual do Host. O Bootstrap valida primeiro a Selection completa e o Core reduz uniformemente a requisição auxiliar real para `values[0]`.

O teste de regressão vertical usa a cadeia real `ProviderRegistry -> ApiProviderModelRuntime -> Core`, provando que a Selection de identidade não falha mais na Factory por falta de Reasoning.

A página de configurações do Subagent também foi corrigida: ao trocar o modelo explícito, ela grava na Model Selection o nível default normal exibido pelo controle segundo o Registry, sem exibir `high` e persistir `undefined`.

Resultado da reavaliação: a chamada normal do Host em Session Create já mescla `model` e `thoughtLevel` antes da criação; o protocolo compartilhado continua permitindo ler Selections de identidade históricas, e `ModelSelection` não pode ser tornado globalmente obrigatório por causa deste Bug. O Model Override explícito de Title hoje não tem escritor de configuração em produção, portanto não foi adicionado branch de compatibilidade sem consumidor. A validação estrita de completude do ModelFactory permanece inalterada.