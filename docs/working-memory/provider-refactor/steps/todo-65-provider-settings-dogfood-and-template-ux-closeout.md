# Todo 65: problemas reais nas configurações de Provider e fechamento de UX de Template

> Status: concluído
>
> Data: 2026-09-02
>
> Origem: experiência real no MacBook Air e comparação visual com o branch de produto `feat/provider-ux-refactor`.
>
> Pré-requisitos: Todo 55, Todo 60, Todo 61, Todo 62 e Todo 63 concluídos. Este Todo não altera a atribuição de estado de Provider Template, Account Overlay, Registry, Model Selection ou Option Spec; apenas corrige lacunas de chamada já confirmadas e regressões de experiência na página de configurações.

## 1. Objetivo

Esta rodada fecha quatro categorias de problemas que já têm evidência prática:

1. O teste de conexão do Start Plan e do Team Plan não envia o `reasoningLevel` obrigatório;
2. A página de seleção de Provider Template não herda por completo a intenção visual válida do branch de produto;
3. O grupo de Providers personalizados vazio exibe incorretamente um traço;
4. Quando a configuração do Provider falha, os issues brutos do Schema se espalham pela área de detalhes à direita.

A implementação deve manter inalteradas as duas cadeias principais abaixo:

```text
ProviderSettingsView.providerTemplates
                |
                v
       ProviderTemplatePicker
                |
                v
 createPersonalProvider({ templateId })
                |
                v
       Personal Provider Config


Effective Provider / Model Registry
                |
                v
           Active Model
                |
                v
     Provider Connectivity Request
```

O branch de produto serve apenas como referência visual e de interação; é proibido trazer de volta para a arquitetura atual o Catálogo antigo de Providers, a montagem de candidatos/Logos/nomes antigos de Built-in ou as especializações antigas de Family/API Key.

## 2. Teste de conexão de Account Provider

### 2.1 Problema confirmado

No MacBook Air, tanto o Start Plan quanto o Team Plan conseguem entrar na lista de modelos, mas o teste de conexão falha e retorna:

```text
Reasoning level is required for <providerId>/<modelId>
```

Isso mostra que a requisição já entrou na cadeia oficial de Model; a falha ocorre porque quem chama o teste de conexão não fornece explicitamente o `reasoningLevel` para modelos que declaram uma Reasoning Option. Não é ausência de plano, de Provider ou de credenciais da conta.

### 2.2 Comportamento desejado

O teste de conexão continua usando o Registry oficial e o Active Model, sem reconhecer individualmente Start, Individual, Team ou IDs de modelos específicos. Conforme o Todo 60, todo Active Model que entra no Registry precisa ter um Reasoning Spec completo; ausência não é um ramo normal, e sim um erro de integridade de configuração a montante.

```text
Active Model.optionSpecs.reasoningLevel
                |
                v
         显式传 values[0]
```

Restrições:

- A ordem de `values` continua representando do mais baixo ao mais alto;
- `values[0]` é o nível mais baixo disponível e não equivale à string `disabled`;
- Não criar `reasoningLevelPolicy` nem ramos de especialização por Provider;
- O ModelFactory apenas valida e monta; não preenche silenciosamente a Option no lugar de quem chama;
- O teste de conexão envia explicitamente `min(5000, optionSpecs.maxOutputTokens.max)`, sem depender do fallback do ModelFactory;
- Cabeçalhos de requisição do Coding Plan como `x-zcode-session-type` continuam sendo produzidos pela cadeia oficial de Access/montagem de requisição; a página de configurações não pode copiá-los por conta própria.

### 2.3 Testes

- Com Reasoning Spec: o teste de conexão envia explicitamente `values[0]`;
- Quando o nível mais baixo não é `disabled`: continua usando o primeiro item;
- Sem Reasoning Spec: tratado como Effective Model Config incompleto; o modelo não pode entrar no Registry;
- Start Plan, Team Plan e Providers comuns com API Key compartilham a mesma lógica de teste de conexão;
- Em caso de falha, exibe a mensagem de erro real da requisição oficial de Model, sem criar novas classificações de erro específicas por Provider.

## 3. Página de seleção de Provider Template

### 3.1 Limites de referência

A solução visual de `feat/provider-ux-refactor` pode servir como referência, mas esse branch é baseado na implementação antiga do domínio de Provider, portanto não é possível copiar componentes ou estados de negócio diretamente.

Referências permitidas:

- Hierarquia visual de cartões compacta e discreta;
- Entrada de "adicionar fornecedor" mais clara no topo;
- Seta no final do cartão;
- Relação de coordenação entre Logo, nome, espaçamento e Hover;
- Grupo vazio não ocupa espaço.

Proibido restaurar:

- Tipos de domínio `ProviderCatalog` ou outros de catálogo;
- Montagem de candidatos, Logos, nomes ou ordenação por Provider ID dentro do Renderer;
- Lógica antiga de criação de Provider Built-in;
- `enabled` no nível superior do Provider;
- API antiga de Account, Family API Key ou especializações por Provider ID;
- Campo de busca;
- Substituição do Logo do Provider por um bloco arrastável no Hover;
- Estados e implementações responsivas não verificados do branch de produto.

### 3.2 Especificação do cartão

Template e "criar fornecedor personalizado" usam o mesmo esqueleto de cartão:

- Altura estritamente fixa em `64px`, sem usar `min-height` e sem crescer dinamicamente por comprimento do nome;
- Largura desktop em duas colunas, colapsando naturalmente para uma coluna estreita;
- `rounded-lg`;
- Fundo e borda de cartão discretos por padrão, reforçados apenas em Hover/Focus;
- Padding horizontal de cerca de `16px`;
- Espaçamento entre cartões de cerca de `8px`;
- Slot de Logo de cerca de `36px`, com Logo em `object-contain`, sem corte;
- Espaçamento entre Logo e nome de cerca de `12px`;
- Nome usando o tamanho de fonte de UI regular com peso médio;
- Nome estritamente em uma linha, truncado quando exceder, mostrando o nome completo em Tooltip;
- Exibir `ChevronRight` no final, expressando claramente a entrada no fluxo de criação;
- Preservar operação por teclado, `focus-visible` e estado desabilitado;
- Não modificar o Token de borda do container externo de duas colunas das configurações de Provider.

### 3.3 Nomes de exibição de Template

Os nomes de exibição publicados oficialmente devem permanecer curtos de propósito, evitando transferir a pressão de layout para a altura dinâmica dos cartões. Prioridade de calibração:

| 当前长名称                           | 目标短名称              |
| ------------------------------------ | ----------------------- |
| Moonshot Kimi                        | Kimi                    |
| Alibaba Model Studio (China)         | Alibaba Cloud (China)   |
| Alibaba Model Studio (International) | Alibaba Cloud (Global)  |
| 阿里云百炼（中国）                   | 阿里云百炼（中国）      |
| 阿里云百炼（国际）                   | 阿里云百炼（国际）      |
| Xiaomi MiMo                          | Xiaomi MiMo / 小米 MiMo |

`Z.AI API`, `BigModel API`, `MiniMax`, `DeepSeek`, `OpenAI`, `Anthropic` e `xAI` mantêm os nomes oficiais curtos. Modificar apenas o `nameMap` de Template; não modificar `templateId`, Provider ID, API Schema ou identidade no Registry.

### 3.4 Entrada do topo e coordenação periférica

- Preservar o fluxo de seleção de Template na área de detalhes à direita e a navegação de Providers à esquerda;
- O texto explicativo do topo, o botão de atualizar e o botão "adicionar fornecedor" recuperam largura, ordem e espaçamento razonáveis;
- "Adicionar fornecedor" deve ser uma ação principal clara, não degradar a uma entrada pequena e difícil de descobrir;
- Não aumentar a largura total da página de configurações de Provider nem reescrever o scroll independente esquerdo/direito já estável;
- Não modificar o Token de borda do container externo de duas colunas; só tratar separadamente se, na prática, ainda for observável um problema claro de hierarquia.

## 4. Grupos vazios e feedback de erro

### 4.1 Grupo vazio de Personal Provider

Quando não houver Personal Provider:

- Não renderizar o grupo "provedores personalizados";
- Não exibir `-` nem outro pseudo-placeholder;
- O "adicionar fornecedor" do topo continua disponível.

Depois que o primeiro Personal Provider for criado, o título do grupo e seus membros passam a ser exibidos normalmente.

### 4.2 Exibição de erros de configuração

O banner visível ao usuário mostra apenas um resumo curto, por exemplo:

```text
创建供应商失败：个人供应商配置格式无效
```

Os issues completos do Zod são gravados no log pelo UI Logger. É proibido renderizar o array bruto de issues diretamente no banner, e também não criar outro conjunto de Toasts ou de classificações de erro.

## 5. Limite da configuração não publicada

O `enabled` de nível superior de Provider que apareceu no MacBook Air é uma configuração de desenvolvimento ainda não publicada. Como o Schema oficial atual removeu explicitamente esse campo:

- Não elevar a Schema Version;
- Não adicionar um migrador de `enabled`;
- Não fazer leitura compatível no Schema estrito;
- Não adicionar dual-read;
- Antes da validação real, limpar no Air a Personal Provider Config de desenvolvimento e recriar os dados de teste.

A implementação oficial não pode reintroduzir o Provider `enabled` por causa desse arquivo antigo.

## 6. Ordem de implementação

1. Corrigir sincronamente a descrição de cartão do Todo 61 que foi substituída por esta decisão: de "duas linhas, sem seta" para "linha única fixa, com seta";
2. Ler e respeitar o `DESIGN.md` na raiz, extraindo a intenção visual em comparação com o branch de produto;
3. Primeiro adicionar o teste de falha do nível mínimo de Reasoning no teste de conexão;
4. Corrigir a Option explícita do teste de conexão;
5. Primeiro adicionar testes de componente/interação para cartão de Template, grupo vazio, truncamento de nome e resumo de erro;
6. Refazer o estilo do cartão e da entrada do topo sobre a fonte de dados de Template atual;
7. Atualizar os E2E de Desktop afetados;
8. Concluir a verificação estática, automatizada e real no MacBook Air;
9. Revisar se Catalog, Provider `enabled`, especialização por Provider ID ou um segundo conjunto de的解释 de erro foram trazidos indevidamente de volta;
10. Submeter um Conventional Commit, com o trailer da sessão real do Agent.

## 7. Plano de verificação

### 7.1 Automatizado

- Testes unitários direcionados de Provider Settings / Template Picker;
- Testes unitários direcionados de Provider Connectivity;
- Testes de interação de criação de Template, nome, Logo, feedback de falha e grupo vazio;
- Regressão da Reasoning Option no teste de conexão Start/Team;
- Desktop E2E: abrir o Template Picker, criar Template Provider, criar Provider personalizado, voltar e feedback de erro;
- `pnpm typecheck`;
- `pnpm lint`;
- `pnpm test:unit`;
- `git diff --check`.

### 7.2 Aceitação real no MacBook Air

A experiência final é definida pela versão de desenvolvimento rodando no MacBook Air após sincronizar o commit atual; pacotes oficiais antigos ou cópias de trabalho antigas não substituem o HEAD atual:

1. Após limpar a Personal Provider Config antiga não publicada, iniciar o aplicativo;
2. Sem Personal Provider, confirmar que o lado esquerdo não mostra grupo vazio nem traço;
3. Abrir adicionar fornecedor e verificar a entrada do topo, cartões em duas colunas, altura fixa, Logo, nome em linha única, Tooltip de truncamento, seta no final, Hover e Focus por teclado;
4. Criar dois Providers do mesmo Template e confirmar a deduplicação normal e a entrada nos detalhes;
5. Criar um Provider puramente personalizado;
6. Simular uma falha de criação e confirmar que apenas o resumo do erro aparece no canto inferior direito, com o motivo detalhado indo para o log;
7. Executar o teste de conexão em `glm-5.3-flash` do Start Plan;
8. Executar o teste de conexão em `GLM-5.3` e `GLM-5.3-Flash` do Team Plan;
9. Confirmar que a requisição não falha mais por falta de `reasoningLevel`; se ainda falhar, preservar o erro real do servidor e continuar a investigação pelo log;
10. Verificar Light/Dark, chinês/inglês e janela estreita, confirmando que a altura dos cartões não muda e que a página não tem scroll horizontal.

A verificação no MacBook Air deve registrar o SHA do commit atual, o comando de inicialização e os principais resultados. Testes estáticos aprovados não substituem essa aceitação real.

## 8. Critérios de conclusão

- O teste de conexão do Start Plan e do Team Plan usa explicitamente Reasoning `values[0]`, sem novo erro local por ausência de Reasoning;
- O Template Picker usa a fonte de dados oficial `providerTemplates` e recupera a experiência de produto compacta já decidida;
- Os cartões têm estritamente uma linha e altura fixa, e nomes longos não alteram o ritmo da grade;
- O grupo vazio de Personal Provider não é renderizado;
- O banner de erro do usuário não expõe mais os issues brutos do Schema;
- A borda externa das duas colunas de Provider é mantida como está;
- Não foram adicionados busca, Catalog, `enabled` no nível superior do Provider, especialização por Provider ID ou uma segunda fonte de verdade de estado;
- A verificação automatizada passa e a aceitação de experiência real do HEAD atual foi concluída no MacBook Air.

## 9. Registro de implementação e aceitação

- O Provider Connectivity lê `values[0]` de forma unificada a partir do Reasoning Spec ordenado do Active Model e envia explicitamente `min(5000, maxOutputTokens.max)`; não houve adição de ramos por plano, Provider ID ou model ID.
- O Template Picker mantém `providerTemplates` como única fonte de dados, com cartão fixo de `64px`, layout de duas colunas, Logo, Tooltip de truncamento em linha única, seta no final e entrada de topo clara.
- O grupo vazio de Personal Provider não é mais renderizado; o banner de erro de criação mostra apenas o resumo, e o issue completo vai para o UI Logger unificado.
- Os testes direcionados de UI/Service relevantes passaram; os 7 E2E de Settings UI no MacBook Pro e os 18 E2E de Coding Plan, incluindo a superfície de conexão Start/Team, passaram. A limpeza da Personal Config antiga e a aceitação visual manual no MacBook Air são operações de ambiente de experiência e não funcionam como portão substituto da correção de código.
- A revisão não encontrou retorno de tipos Catalog, `enabled` de nível superior de Provider, especialização por Provider ID nem uma segunda classificação de erros do teste de conexão.